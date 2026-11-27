import { describe, expect, test } from 'bun:test';
import { checkSkill, matchSkills, parseSkillFile, skillFile, skillName, slashSkills, SKILL_INSTRUCTIONS_MAX } from '../src/lib/chat-skills';
import { acceptProposal, deleteSkill, fetchSkill, getProposal, getSkill, invokedSkills, listSkills, PENDING_TTL, proposeAllFromSource, proposeSkill, saveSkill, searchRegistry, setSkillEnabled, SkillError, skillSource, skillText, SKILL_PAGE } from '../src/lib/server/chat/skills';
import { isSkillTool, skillsSection, skillTools } from '../src/lib/server/chat/skill-tools';
import { isPrivateTool, projectMessages, requestOf, skillFrom, skillSetFrom, toolLabel } from '../src/lib/server/chat/projection';
import { isOwnerTool } from '../src/lib/server/chat/tools';

function bucket() {
	const objects = new Map<string, string>();
	return {
		objects,
		async get(key: string) { const value = objects.get(key); return value === undefined ? null : { json: async () => JSON.parse(value), text: async () => value }; },
		async put(key: string, value: string) { objects.set(key, value); },
		async delete(key: string) { objects.delete(key); }
	} as unknown as R2Bucket & { objects: Map<string, string> };
}

const SKILL_MD = `---
name: link-roundup
description: >
  Write a link roundup post from recent bookmarks.
  Use when Casey asks for a roundup.
allowed-tools: Bash(rm:*), micropub_create_post
license: MIT
---

# Link roundup

1. search_site for the week's bookmarks.
2. Draft a post.
`;

/** GitHub and skills.sh, stood in for by a map of address to body. */
function web(pages: Record<string, string | object>) {
	const asked: string[] = [];
	const fetcher = (async (input: RequestInfo | URL) => {
		const url = String(input);
		asked.push(url);
		const body = pages[url];
		if (body === undefined) return new Response('Not found', { status: 404 });
		return typeof body === 'string' ? new Response(body) : Response.json(body);
	}) as typeof fetch;
	return { fetcher, asked };
}

describe('skill files', () => {
	test('a SKILL.md gives its name, description and instructions, and nothing else', () => {
		const parsed = parseSkillFile(SKILL_MD);
		expect(parsed.name).toBe('link-roundup');
		expect(parsed.description).toBe('Write a link roundup post from recent bookmarks. Use when Casey asks for a roundup.');
		expect(parsed.instructions.startsWith('# Link roundup')).toBe(true);
		expect(Object.keys(parsed).sort()).toEqual(['description', 'instructions', 'name']);
	});

	test('quoted and plain descriptions, and a file with no frontmatter', () => {
		expect(parseSkillFile('---\nname: a\ndescription: "Says: hello"\n---\nBody').description).toBe('Says: hello');
		expect(parseSkillFile("---\nname: a\ndescription: It's plain: with a colon\n---\nBody").description).toBe("It's plain: with a colon");
		expect(parseSkillFile('Just instructions.')).toEqual({ instructions: 'Just instructions.' });
	});

	test('a skill written out reads back the same', () => {
		const skill = { name: 'weekly-review', description: 'Review the week: "posts", likes.', instructions: '# Steps\n\nDo it.' };
		expect(parseSkillFile(skillFile(skill))).toEqual(skill);
	});

	test('names become slash commands', () => {
		expect(skillName('PR Review!')).toBe('pr-review');
		expect(skillName('/Weekly_Review ')).toBe('weekly-review');
	});

	test('a skill needs a valid name, a description and instructions', () => {
		expect(checkSkill({ name: 'Bad Name', description: 'x', instructions: 'y' })).toHaveProperty('error');
		expect(checkSkill({ name: 'ok', description: '', instructions: 'y' })).toHaveProperty('error');
		expect(checkSkill({ name: 'ok', description: 'x', instructions: ' ' })).toHaveProperty('error');
		expect(checkSkill({ name: 'ok', description: 'x', instructions: 'y' })).toEqual({ skill: { name: 'ok', description: 'x', instructions: 'y' }, notes: [] });
	});

	test('over-long instructions are cut and said to be', () => {
		const checked = checkSkill({ name: 'long', description: 'x', instructions: 'a'.repeat(SKILL_INSTRUCTIONS_MAX + 500) });
		if ('error' in checked) throw new Error(checked.error);
		expect(checked.skill.instructions.length).toBe(SKILL_INSTRUCTIONS_MAX);
		expect(checked.notes[0]).toContain('only the first');
	});

	test('only Markdown and text reference files are kept, never a path that climbs out', () => {
		const checked = checkSkill({ name: 'files', description: 'x', instructions: 'y', files: { 'references/a.md': 'A', 'scripts/run.py': 'import os', '../../etc/passwd.txt': 'no', 'notes.txt': 'N' } });
		if ('error' in checked) throw new Error(checked.error);
		expect(Object.keys(checked.skill.files ?? {})).toEqual(['references/a.md', 'notes.txt']);
	});
});

describe('slash commands', () => {
	const names = ['link-roundup', 'skill-creator'];

	test('/name anywhere in a message invokes that skill', () => {
		expect(slashSkills('/link-roundup for this week', names)).toEqual(['link-roundup']);
		expect(slashSkills('/skill-creator', names)).toEqual(['skill-creator']);
		expect(slashSkills('for this week, do a /link-roundup please', names)).toEqual(['link-roundup']);
		expect(slashSkills('first /link-roundup, then (/skill-creator) and /link-roundup again', names)).toEqual(['link-roundup', 'skill-creator']);
	});

	test('anything else is just text', () => {
		expect(slashSkills('/unknown thing', names)).toEqual([]);
		expect(slashSkills('/2026/11/25/a-post is good', names)).toEqual([]);
		expect(slashSkills('see https://example.com/link-roundup and/or notes/link-roundup', names)).toEqual([]);
		expect(slashSkills('the page /link-roundup/2 and /link-roundup-2', names)).toEqual([]);
	});

	test('the composer offers the skills that match what was typed after the slash', () => {
		const skills = [{ name: 'find-skills', description: 'Find published skills.' }, { name: 'skill-creator', description: 'Write a skill.' }, { name: 'roundup', description: 'Links.' }];
		expect(matchSkills(skills, 'sk').map((skill) => skill.name)).toEqual(['skill-creator', 'find-skills']);
		expect(matchSkills(skills, '').length).toBe(3);
	});
});

describe('the skills store', () => {
	test('the built-in skills are there from the start, and can be turned off but not removed or replaced', async () => {
		const store = bucket();
		expect((await listSkills(store)).map((skill) => [skill.name, skill.origin, skill.enabled])).toEqual([['skill-creator', 'builtin', true], ['find-skills', 'builtin', true]]);
		expect((await listSkills(undefined)).length).toBe(2);
		await setSkillEnabled(store, 'find-skills', false);
		expect((await listSkills(store)).find((skill) => skill.name === 'find-skills')?.enabled).toBe(false);
		expect((await getSkill(store, 'find-skills'))?.enabled).toBe(false);
		await expect(deleteSkill(store, 'skill-creator')).rejects.toBeInstanceOf(SkillError);
		await expect(saveSkill(store, { name: 'skill-creator', description: 'x', instructions: 'y' })).rejects.toBeInstanceOf(SkillError);
		await expect(proposeSkill(store, { name: 'skill-creator', description: 'x', instructions: 'y' }, { origin: 'custom' })).rejects.toBeInstanceOf(SkillError);
	});

	test('a skill is saved, edited, renamed, turned off and deleted', async () => {
		const store = bucket();
		await saveSkill(store, { name: 'roundup', description: 'Links.', instructions: 'Do it.' }, { now: 1 });
		expect((await getSkill(store, 'roundup'))?.origin).toBe('custom');
		await setSkillEnabled(store, 'roundup', false);
		await saveSkill(store, { name: 'link-roundup', description: 'Links, weekly.', instructions: 'Do it well.' }, { previous: 'roundup', now: 2 });
		expect(await getSkill(store, 'roundup')).toBeNull();
		const renamed = await getSkill(store, 'link-roundup');
		expect(renamed).toMatchObject({ description: 'Links, weekly.', enabled: false, updatedAt: 2 });
		expect((await listSkills(store)).map((skill) => skill.name)).toEqual(['skill-creator', 'find-skills', 'link-roundup']);
		await deleteSkill(store, 'link-roundup');
		expect((await listSkills(store)).length).toBe(2);
		expect(await getSkill(store, 'link-roundup')).toBeNull();
	});

	test('a proposal is not a skill until it is accepted, and goes stale', async () => {
		const store = bucket();
		const proposal = await proposeSkill(store, { name: 'roundup', description: 'Links.', instructions: 'Do it.' }, { origin: 'custom', now: 1000 });
		expect((await listSkills(store)).length).toBe(2);
		expect(await invokedSkills(store, '/roundup now')).toBeNull();
		expect((await getProposal(store, proposal.id, 2000))?.skill.name).toBe('roundup');
		expect(await getProposal(store, proposal.id, 1000 + PENDING_TTL + 1)).toBeNull();
		await expect(acceptProposal(store, proposal.id, 1000 + PENDING_TTL + 1)).rejects.toBeInstanceOf(SkillError);
		await acceptProposal(store, proposal.id, 3000);
		expect((await getSkill(store, 'roundup'))?.instructions).toBe('Do it.');
		// Added once: the card can't add it again.
		await expect(acceptProposal(store, proposal.id, 4000)).rejects.toBeInstanceOf(SkillError);
		expect((await proposeSkill(store, { name: 'roundup', description: 'New.', instructions: 'New.' }, { origin: 'custom' })).replaces).toBe('roundup');
	});

	test('/name brings an enabled skill’s instructions, framed as instructions only', async () => {
		const store = bucket();
		await saveSkill(store, { name: 'roundup', description: 'Links.', instructions: 'Step one.' });
		const invoked = await invokedSkills(store, '/roundup this week');
		expect(invoked?.names).toEqual(['roundup']);
		expect((await invokedSkills(store, 'this week, a /roundup please'))?.names).toEqual(['roundup']);
		expect(invoked?.text).toContain('Step one.');
		expect(invoked?.text).toContain('no tools or permissions beyond the ones you have');
		await setSkillEnabled(store, 'roundup', false);
		expect(await invokedSkills(store, '/roundup this week')).toBeNull();
		expect(await invokedSkills(store, 'roundup this week')).toBeNull();
	});

	test('long instructions come a page at a time, and an installed skill says where it is from', () => {
		const skill = { name: 'long', description: 'x', instructions: 'a'.repeat(SKILL_PAGE + 10), enabled: true, origin: 'installed' as const, source: 'https://skills.sh/a/b/long', updatedAt: 0, files: { 'references/x.md': 'X' } };
		const first = skillText(skill);
		expect(first).toContain('Casey installed from https://skills.sh/a/b/long');
		expect(first).toContain(`from=${SKILL_PAGE}`);
		expect(first).toContain('references/x.md');
		expect(skillText(skill, SKILL_PAGE)).toContain('Continuing from character');
	});
});

describe('skills from elsewhere', () => {
	test('ids, CLI commands and addresses all say where a skill is', () => {
		expect(skillSource('anthropics/skills/frontend-design')).toEqual({ owner: 'anthropics', repo: 'skills', skill: 'frontend-design' });
		expect(skillSource('npx skills add vercel-labs/agent-skills@react-best-practices -g -y')).toEqual({ owner: 'vercel-labs', repo: 'agent-skills', skill: 'react-best-practices' });
		expect(skillSource('https://www.skills.sh/vercel-labs/skills/find-skills')).toEqual({ owner: 'vercel-labs', repo: 'skills', skill: 'find-skills' });
		expect(skillSource('https://github.com/anthropics/skills/tree/main/skills/skill-creator')).toEqual({ owner: 'anthropics', repo: 'skills', ref: 'main', path: 'skills/skill-creator', skill: 'skill-creator' });
		expect(skillSource('https://github.com/a/b/blob/main/x/SKILL.md')).toEqual({ owner: 'a', repo: 'b', ref: 'main', path: 'x', skill: 'x' });
		expect(skillSource('https://github.com/a/b')).toEqual({ owner: 'a', repo: 'b' });
		expect(skillSource('https://evil.example/a/b/c')).toBeNull();
		expect(skillSource('http://github.com/a/b')).toBeNull();
		expect(skillSource('https://github.com/a/b/tree/main/../../x')).toBeNull();
	});

	test('a skill is read from its usual folder, with its reference files; scripts are left behind', async () => {
		const { fetcher } = web({
			'https://raw.githubusercontent.com/acme/skills/HEAD/skills/link-roundup/SKILL.md': SKILL_MD,
			'https://api.github.com/repos/acme/skills/git/trees/HEAD?recursive=1': { tree: [
				{ path: 'skills/link-roundup/SKILL.md', type: 'blob' }, { path: 'skills/link-roundup/references/format.md', type: 'blob' },
				{ path: 'skills/link-roundup/scripts/post.py', type: 'blob' }, { path: 'skills/link-roundup/LICENSE.txt', type: 'blob' }, { path: 'skills/other/SKILL.md', type: 'blob' }
			] },
			'https://raw.githubusercontent.com/acme/skills/HEAD/skills/link-roundup/references/format.md': '# Format'
		});
		const fetched = await fetchSkill({ owner: 'acme', repo: 'skills', skill: 'link-roundup' }, fetcher);
		expect(fetched.input).toMatchObject({ name: 'link-roundup', files: { 'references/format.md': '# Format' } });
		expect(fetched.source).toBe('https://skills.sh/acme/skills/link-roundup');
		expect(fetched.notes.join(' ')).toContain('1 other file');
	});

	test('a skill kept somewhere unusual is found through the repository’s tree', async () => {
		const { fetcher } = web({
			'https://api.github.com/repos/acme/kit/git/trees/HEAD?recursive=1': { tree: [{ path: 'agents/packs/link-roundup/SKILL.md', type: 'blob' }] },
			'https://raw.githubusercontent.com/acme/kit/HEAD/agents/packs/link-roundup/SKILL.md': SKILL_MD
		});
		expect((await fetchSkill({ owner: 'acme', repo: 'kit', skill: 'link-roundup' }, fetcher)).input.name).toBe('link-roundup');
		await expect(fetchSkill({ owner: 'acme', repo: 'kit', skill: 'missing' }, fetcher)).rejects.toBeInstanceOf(SkillError);
	});

	test('a fetched skill waits for review, marked as someone else’s; its frontmatter grants nothing', async () => {
		const store = bucket();
		const { fetcher } = web({ 'https://raw.githubusercontent.com/acme/skills/HEAD/skills/link-roundup/SKILL.md': SKILL_MD });
		const [proposal] = (await proposeAllFromSource(store, 'acme/skills/link-roundup', fetcher)).proposals;
		expect(proposal.skill.origin).toBe('installed');
		expect(proposal.notes[0]).toContain('written by someone else');
		expect(JSON.stringify(proposal)).not.toContain('allowed-tools');
		expect((await listSkills(store)).length).toBe(2);
		await expect(proposeAllFromSource(store, 'https://evil.example/x.md', fetcher)).rejects.toBeInstanceOf(SkillError);
	});

	test('a repository or plugin marketplace puts each of its skills up for review, and only its skills', async () => {
		const store = bucket();
		const md = (name: string) => `---\nname: ${name}\ndescription: Does ${name}.\nallowed-tools: Bash\n---\n\n# ${name}\n\nSteps.`;
		const raw = 'https://raw.githubusercontent.com/acme/market/HEAD/';
		const { fetcher } = web({
			'https://api.github.com/repos/acme/market/git/trees/HEAD?recursive=1': { tree: [
				'.claude-plugin/marketplace.json', 'plugins/release/.claude-plugin/plugin.json', 'plugins/release/skills/changelog/SKILL.md', 'plugins/release/skills/changelog/scripts/run.sh',
				'plugins/release/commands/ship.md', 'plugins/release/hooks/hooks.json', 'plugins/editing/skills/plain-language/SKILL.md', 'plugins/editing/skills/broken/SKILL.md'
			].map((path) => ({ path, type: 'blob' })) },
			[`${raw}.claude-plugin/marketplace.json`]: { name: 'acme', plugins: [{ name: 'release', source: './plugins/release' }, { name: 'editing', source: './plugins/editing' }, { name: 'deploy-tools', source: { source: 'github', repo: 'acme/deploy' } }] },
			[`${raw}plugins/release/skills/changelog/SKILL.md`]: md('changelog'),
			[`${raw}plugins/editing/skills/plain-language/SKILL.md`]: md('plain-language'),
			[`${raw}plugins/editing/skills/broken/SKILL.md`]: '---\nname: broken\n---\n'
		});
		for (const address of ['acme/market', 'https://github.com/acme/market', 'https://github.com/acme/market/blob/main/.claude-plugin/marketplace.json'.replace('/blob/main', '/blob/HEAD')]) {
			const set = await proposeAllFromSource(store, address, fetcher);
			expect(set.proposals.map((proposal) => proposal.skill.name)).toEqual(['changelog', 'plain-language']);
			expect(set).toMatchObject({ total: 3, repository: 'acme/market' });
			expect(set.notes.join(' ')).toContain('plugin marketplace');
			expect(set.notes.join(' ')).toContain('deploy-tools');
			expect(set.notes.join(' ')).toContain('broken');
			expect(set.proposals[0].notes).toContain('From the plugin “release”.');
			// The command, the hooks and the script stay where they are, and nothing is granted.
			expect(JSON.stringify(set)).not.toContain('allowed-tools');
			expect(JSON.stringify(set)).not.toContain('ship');
			expect(Object.keys(set.proposals[0].skill.files ?? {})).toEqual([]);
		}
		// Nothing is a skill of Casey's until each is added by itself.
		expect((await listSkills(store)).length).toBe(2);
		// A folder of the repository: only the skills under it.
		const under = await proposeAllFromSource(store, 'https://github.com/acme/market/tree/HEAD/plugins/release', fetcher);
		expect(under.proposals.map((proposal) => proposal.skill.name)).toEqual(['changelog']);
		expect(under.repository).toBeUndefined();
	});

	test('the registry search reads skills.sh', async () => {
		const { fetcher, asked } = web({ 'https://skills.sh/api/search?q=link+roundup&limit=8&owner=acme': { skills: [{ id: 'acme/skills/link-roundup', skillId: 'link-roundup', name: 'link-roundup', source: 'acme/skills', installs: 1200 }] } });
		expect(await searchRegistry('link roundup', { owner: 'acme', fetcher })).toEqual([{ id: 'acme/skills/link-roundup', name: 'link-roundup', source: 'acme/skills', installs: 1200, url: 'https://skills.sh/acme/skills/link-roundup' }]);
		expect(asked.length).toBe(1);
		await expect(searchRegistry('x', { fetcher })).rejects.toBeInstanceOf(SkillError);
	});
});

describe('skills in the chat', () => {
	const run = async (tool: { execute: (args: unknown, ...rest: never[]) => unknown }, args: unknown) => ((await (tool.execute as (args: unknown) => Promise<{ output: { text: string }[] }>)(args)).output[0].text);

	test('the prompt lists skills that are on by name and a line, never their instructions', async () => {
		const store = bucket();
		await saveSkill(store, { name: 'roundup', description: 'Write a link roundup. '.repeat(30), instructions: 'SECRET STEPS' });
		await saveSkill(store, { name: 'off-one', description: 'Not used.', instructions: 'x' });
		await setSkillEnabled(store, 'off-one', false);
		const section = (await skillsSection(store))!;
		expect(section).toContain('- roundup: Write a link roundup.');
		expect(section).toContain('- skill-creator:');
		expect(section).not.toContain('off-one');
		expect(section).not.toContain('SECRET STEPS');
		expect(section.length).toBeLessThan(1900);
	});

	test('use_skill hands over an enabled skill and names the others for a wrong one', async () => {
		const store = bucket();
		await saveSkill(store, { name: 'roundup', description: 'Links.', instructions: 'Step one.', files: { 'references/format.md': 'The format.' } });
		const [use] = skillTools({ bucket: () => store });
		expect(await run(use, { name: '/roundup' })).toContain('Step one.');
		expect(await run(use, { name: 'roundup', file: 'references/format.md' })).toContain('The format.');
		await expect(run(use, { name: 'nope' })).rejects.toThrow('roundup');
		await setSkillEnabled(store, 'roundup', false);
		await expect(run(use, { name: 'roundup' })).rejects.toThrow('turned on');
	});

	test('skill_add only ever makes a review card', async () => {
		const store = bucket();
		const { fetcher } = web({ 'https://raw.githubusercontent.com/acme/skills/HEAD/skills/link-roundup/SKILL.md': SKILL_MD });
		const add = skillTools({ bucket: () => store, fetcher })[2];
		const drafted = JSON.parse(await run(add, { name: 'weekly', description: 'Weekly review.', instructions: 'Do it.' }));
		expect(drafted.review).toMatchObject({ name: 'weekly', origin: 'custom' });
		expect(drafted.status).toContain('NOT added');
		const fetched = JSON.parse(await run(add, { source: 'acme/skills/link-roundup' }));
		expect(fetched.review).toMatchObject({ name: 'link-roundup', origin: 'installed', source: 'https://skills.sh/acme/skills/link-roundup' });
		expect((await listSkills(store)).map((skill) => skill.name)).toEqual(['skill-creator', 'find-skills']);
		await expect(run(add, {})).rejects.toThrow('source');
	});

	test('the skill tools are Casey’s alone, and a skill’s words stay out of what readers can open', () => {
		for (const name of ['use_skill', 'skill_find', 'skill_add']) { expect(isSkillTool(name)).toBe(true); expect(isOwnerTool(name)).toBe(true); }
		expect(isPrivateTool('use_skill')).toBe(true);
		expect(isPrivateTool('skill_add')).toBe(true);
		expect(requestOf('skill_add', { name: 'weekly', description: 'Weekly.', instructions: 'PRIVATE' }).map((row) => row.name)).toEqual(['Name', 'Description']);
		expect(toolLabel('use_skill', { name: 'roundup' })).toBe('Used the skill “roundup”');
		expect(toolLabel('skill_find', { query: 'notes' })).toBe('Searched skills.sh for “notes”');
	});

	test('several skills offered at once reach the chat as one set of references', () => {
		const ref = (id: string, name: string) => ({ id, name, description: 'x', origin: 'installed', source: 'https://github.com/acme/market/tree/HEAD/x' });
		const set = skillSetFrom(JSON.stringify({ reviews: [ref('abcdefabcdef', 'changelog'), ref('../../secret', 'bad'), ref('abcdefabcde0', 'plain-language')], from: 'acme/market', total: 9, notes: ['A marketplace.'] }));
		expect(set).toEqual({ skills: [expect.objectContaining({ name: 'changelog' }), expect.objectContaining({ name: 'plain-language' })], from: 'acme/market', total: 9, notes: ['A marketplace.'] });
		expect(skillSetFrom(JSON.stringify({ reviews: [], from: 'acme/market' }))).toBeUndefined();
		expect(skillSetFrom(JSON.stringify({ reviews: [ref('abcdefabcdef', 'changelog')], from: 'javascript:alert(1)' }))?.from).toBeUndefined();
	});

	test('a skill_add step carries the card’s reference, and a message says which skill it invoked', () => {
		const review = { id: 'abcdefghijkl', name: 'weekly', description: 'Weekly review.', origin: 'custom' };
		expect(skillFrom(JSON.stringify({ review, status: 'Shown' }))).toEqual(review as never);
		expect(skillFrom(JSON.stringify({ review: { ...review, id: '../x' } }))).toBeUndefined();
		const author = { id: 'owner', name: 'Casey', via: 'owner' as const };
		const messages = projectMessages([
			{ id: '1', kind: 'chat.say', data: { id: 'm1', author, owner: true, at: 1, text: '/weekly now', skills: ['weekly'] } },
			{ id: '2', kind: 'message', model: [{ role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'skill_add', arguments: { name: 'weekly', instructions: 'PRIVATE' } }] }] },
			{ id: '3', kind: 'message', model: [{ role: 'toolResult', toolCallId: 'c1', toolName: 'skill_add', isError: false, content: [{ type: 'text', text: JSON.stringify({ review, status: 'Shown' }) }] }] }
		]);
		expect(messages[0]).toMatchObject({ skills: ['weekly'], content: '/weekly now' });
		expect(messages[1].tools?.[0]).toMatchObject({ skill: review, label: 'Offered the skill “weekly”' });
		expect(messages[1].tools?.[0].response).toBeUndefined();
		expect(JSON.stringify(messages)).not.toContain('PRIVATE');
	});
});
