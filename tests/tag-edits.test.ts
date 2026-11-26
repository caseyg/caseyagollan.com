import { describe, expect, test } from 'bun:test';
import { applyEdit, cleanTags, groupStaged, stageTags, tagRef, tagSummary, tagViews, tallyTags, validRef } from '../src/lib/tag-edits';
import { cleanBlock } from '../src/lib/tables';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';
import { readDocument } from '../src/lib/server/publishing/document';
import { commitPostTags, readPostTags } from '../src/lib/server/publishing/post-tags';
import { commitTags, readTags } from '../src/lib/server/tags';
import { raindropBlock } from '../src/lib/server/raindrop';

describe('tag edits', () => {
	test('a block says what its tags belong to', () => {
		expect(tagRef({ kind: 'post', url: '/2026/11/14/hello' })).toBe('post:/2026/11/14/hello/');
		expect(tagRef({ kind: 'link', url: '/2026/11/14/hello/' })).toBe('post:/2026/11/14/hello/');
		expect(tagRef({ kind: 'raindrop', url: 'https://a.test/x', ref: 'raindrop:42' })).toBe('raindrop:42');
		expect(tagRef({ kind: 'raindrop', url: 'https://a.test/x' })).toBe('raindrop:link:https://a.test/x');
		expect(tagRef({ kind: 'link', url: 'https://a.test/x', ref: 'readwise:document:01m89b1r3qqjp35t89j0h0b4rv' })).toBe('readwise:document:01m89b1r3qqjp35t89j0h0b4rv');
		expect(tagRef({ kind: 'quote', url: '/2026/11/14/hello/' })).toBeNull();
		expect(tagRef({ kind: 'book', url: '/library/123' })).toBeNull();
		expect(tagRef({ kind: 'link', url: 'https://a.test/x', ref: 'readwise:document:../../etc' })).toBeNull();
		for (const ref of ['post:/2026/11/14/hello/', 'raindrop:42', 'raindrop:link:https://a.test/x', 'readwise:highlight:9', 'readwise:book:9']) expect(validRef(ref)).toBe(true);
		for (const ref of ['post:/etc/passwd', 'raindrop:x', 'arena:1', 'readwise:document:1', 5]) expect(validRef(ref)).toBe(false);
	});

	test('blocks keep where they came from, and nothing else, as their ref', () => {
		expect(raindropBlock({ _id: 42, link: 'https://a.test/x', title: 'X' })?.ref).toBe('raindrop:42');
		expect(cleanBlock({ kind: 'raindrop', url: 'https://a.test/x', title: 'X', ref: 'raindrop:42' })?.ref).toBe('raindrop:42');
		expect(cleanBlock({ kind: 'raindrop', url: 'https://a.test/x', title: 'X', ref: 'javascript:alert(1)' })).not.toHaveProperty('ref');
	});

	test('tags are cleaned as typed', () => {
		expect(cleanTags(['#IndieWeb, tables', ' tables ', 'indieweb', '', 'two  words'])).toEqual(['IndieWeb', 'tables', 'two words']);
	});

	test('staging adds and removes, undoes the opposite, and skips what changes nothing', () => {
		const current = { a: ['one', 'two'], b: ['two'] };
		let staged = stageTags({}, ['a', 'b'], { add: ['One', 'three'] }, current);
		expect(staged).toEqual({ a: { add: ['three'], remove: [] }, b: { add: ['One', 'three'], remove: [] } });
		staged = stageTags(staged, ['a', 'b'], { remove: ['TWO', 'three', 'absent'] }, current);
		expect(staged).toEqual({ a: { add: [], remove: ['two'] }, b: { add: ['One'], remove: ['two'] } });
		staged = stageTags(staged, ['a'], { add: ['two'] }, current);
		expect(staged).toEqual({ b: { add: ['One'], remove: ['two'] } });
		// Tags not read yet: the change is staged as asked.
		expect(stageTags({}, ['c'], { remove: ['x'], add: ['y'] })).toEqual({ c: { add: ['y'], remove: ['x'] } });
	});

	test('an edit applies, shows as states, and tallies across a selection', () => {
		const edit = { add: ['new'], remove: ['Old'] };
		expect(applyEdit(['old', 'keep'], edit)).toEqual(['keep', 'new']);
		expect(tagViews(['old', 'keep'], edit)).toEqual([{ name: 'old', state: 'removed' }, { name: 'keep', state: 'kept' }, { name: 'new', state: 'added' }]);
		const tally = tallyTags([{ tags: ['old', 'keep'], edit }, { tags: ['keep'] }, { tags: [] }]);
		expect(tally).toEqual([{ name: 'keep', count: 2, total: 3, state: 'kept' }, { name: 'new', count: 1, total: 3, state: 'added' }, { name: 'old', count: 0, total: 3, state: 'removed' }]);
	});

	test('a summary names the tags, and stops before it is too long for a commit', () => {
		expect(tagSummary([{ add: ['a'], remove: ['b'] }, { add: ['a', 'c'], remove: [] }])).toBe('Tag 2 posts: +a +c −b');
		expect(tagSummary([{ add: Array.from({ length: 30 }, (_, n) => `tag-${n}`), remove: [] }]).length).toBeLessThanOrEqual(72);
		expect(groupStaged({ 'raindrop:1': { add: ['a'], remove: [] }, 'post:/2026/11/14/x/': { add: ['a'], remove: [] } }).map((group) => group.source)).toEqual(['post', 'raindrop']);
	});
});

const config: PublishingConfig = { me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect', owner: 'caseyg', repo: 'test-content', branch: 'test', token: 'git-secret', timeZone: 'America/New_York' };
const unb64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), (x) => x.charCodeAt(0)));

/** An in-memory content repository that counts its commits. */
function repository(initial: Record<string, string>) {
	const files = new Map(Object.entries(initial));
	const commits: { headline: string; body?: string; paths: string[] }[] = [];
	let moved = false;
	const fetcher = async (url: string, init: RequestInit) => {
		if (url.includes('/git/ref/')) return Response.json({ object: { sha: `head-${commits.length}` } });
		if (url.includes('/git/trees/')) return Response.json({ truncated: false, tree: [...files.keys()].map((path) => ({ path, type: 'blob' })) });
		if (url !== 'https://api.github.com/graphql') throw new Error(`Unexpected ${url}`);
		const { query, variables } = JSON.parse(init.body as string);
		if (query.startsWith('query Read')) {
			const repository: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(variables as Record<string, string>)) {
				if (!key.startsWith('e')) continue;
				const path = value.slice(value.indexOf(':') + 1);
				repository[`f${key.slice(1)}`] = files.has(path) ? { oid: `sha-${path}`, text: files.get(path), isBinary: false, isTruncated: false } : null;
			}
			return Response.json({ data: { repository } });
		}
		const input = variables.input;
		if (moved || input.expectedHeadOid !== `head-${commits.length}`) return Response.json({ errors: [{ type: 'STALE_DATA' }] });
		for (const added of input.fileChanges.additions) files.set(added.path, unb64(added.contents));
		commits.push({ headline: input.message.headline, body: input.message.body, paths: input.fileChanges.additions.map((added: { path: string }) => added.path) });
		return Response.json({ data: { createCommitOnBranch: { commit: { oid: `commit-${commits.length}` } } } });
	};
	return { files, commits, fetcher, move: () => (moved = true) };
}

const post = (date: string, extra = '') => `---\ndate: ${date}T10:00:00-05:00\n${extra}---\n\nHello\n`;
const now = () => new Date('2026-11-25T17:00:00Z');

describe('post tags in the content repository', () => {
	const setup = () => repository({
		'notes/2026-11-14-one.md': post('2026-11-14', 'category:\n  - indieweb\n  - Misc\n'),
		'articles/2026-11-15-two.md': post('2026-11-15', 'title: Two\ncategory: tables\n'),
		'notes/2026-11-16-three.md': post('2026-11-16'),
		'notes/2026-11-17-gone.md': post('2026-11-17', 'deleted: true\n')
	});
	const refs = ['post:/2026/11/14/one/', 'post:/2026/11/15/two/', 'post:/2026/11/16/three/', 'post:/2026/11/17/gone/', 'post:/2026/11/18/nowhere/'];

	test('reads every post’s tags with one tree request and one read', async () => {
		const repo = setup();
		const asked: string[] = [];
		const items = await readPostTags(config, refs, { fetcher: (url, init) => { asked.push(url); return repo.fetcher(url, init); } });
		expect(items.map((item) => item.tags)).toEqual([['indieweb', 'Misc'], ['tables'], [], [], []]);
		expect(items[3].error).toMatch(/deleted/);
		expect(items[4].error).toMatch(/No post/);
		expect(asked.length).toBe(2);
	});

	test('a batch is one commit: every changed file, a new updated date, other front matter untouched', async () => {
		const repo = setup();
		const result = await commitPostTags(config, [
			{ ref: refs[0], add: ['Tables', 'indieweb'], remove: ['misc'] },
			{ ref: refs[1], add: ['tables'], remove: [] },
			{ ref: refs[2], add: ['tables'], remove: ['absent'] },
			{ ref: refs[4], add: ['tables'], remove: [] }
		], { fetcher: repo.fetcher, now });
		expect(repo.commits).toEqual([{ headline: 'Tag 2 posts: +Tables −Misc', body: expect.stringContaining('notes/2026-11-14-one.md: +Tables −Misc'), paths: ['notes/2026-11-14-one.md', 'notes/2026-11-16-three.md'] }]);
		expect(result.commit).toEqual({ sha: 'commit-1', url: 'https://github.com/caseyg/test-content/commit/commit-1' });
		expect(result.items).toEqual([
			{ ref: refs[0], ok: true, tags: ['indieweb', 'Tables'] },
			{ ref: refs[1], ok: true, tags: ['tables'] },
			{ ref: refs[2], ok: true, tags: ['tables'] },
			{ ref: refs[4], ok: false, error: expect.stringMatching(/No post/) }
		]);
		const one = readDocument(repo.files.get('notes/2026-11-14-one.md')!);
		expect(one.properties.category).toEqual(['indieweb', 'Tables']);
		expect(one.properties.updated).toEqual(['2026-11-25T12:00:00-05:00']);
		expect(one.properties.published).toEqual(['2026-11-14T10:00:00-05:00']);
		expect(repo.files.get('notes/2026-11-14-one.md')).toEndWith('---\n\nHello\n');
		// A post the batch didn't change is not rewritten.
		expect(repo.files.get('articles/2026-11-15-two.md')).toBe(post('2026-11-15', 'title: Two\ncategory: tables\n'));
	});

	test('nothing to change makes no commit; a branch that moved refuses the whole batch', async () => {
		const repo = setup();
		expect((await commitPostTags(config, [{ ref: refs[1], add: ['tables'], remove: [] }], { fetcher: repo.fetcher, now })).commit).toBeUndefined();
		repo.move();
		const refused = await commitPostTags(config, [{ ref: refs[1], add: ['new'], remove: [] }], { fetcher: repo.fetcher, now });
		expect(refused.error).toMatch(/changed while this was saving/);
		expect(refused.items).toEqual([{ ref: refs[1], ok: false }]);
		expect(repo.commits.length).toBe(0);
	});

	test('without publishing (a preview, the demo) a save is a dry run from the built posts', async () => {
		const bundled = async () => [{ slug: 'one', date: '2026-11-14T10:00:00-05:00', type: 'note', category: ['indieweb'], content: '' }] as never;
		expect(await readPostTags(undefined, [refs[0], refs[1]], { bundled })).toEqual([{ ref: refs[0], tags: ['indieweb'] }, { ref: refs[1], tags: [], error: expect.any(String) }]);
		const result = await commitPostTags(undefined, [{ ref: refs[0], add: ['tables'], remove: ['indieweb'] }], { bundled });
		expect(result).toEqual({ source: 'post', dryRun: true, message: 'Tag 1 post: +tables −indieweb', items: [{ ref: refs[0], ok: true, tags: ['tables'] }] });
	});
});

/** Raindrop and Readwise, with tags that can be read and changed; `calls` records every write. */
function services() {
	const drops = new Map<number, { _id: number; link: string; tags: string[] }>([[1, { _id: 1, link: 'https://a.test/one', tags: ['design'] }], [2, { _id: 2, link: 'https://a.test/two/', tags: [] }]]);
	const documents = new Map<string, string[]>([['01m89b1r3qqjp35t89j0h0b4rv', ['AI']]]);
	const highlightTags = [{ id: 7, name: 'quote' }];
	const calls: { method: string; url: string; body?: unknown }[] = [];
	let limit = false;
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input)), method = init?.method ?? 'GET';
		const body = init?.body ? JSON.parse(init.body as string) : undefined;
		if (method !== 'GET') calls.push({ method, url: url.pathname, body });
		if (limit) return new Response('{}', { status: 429, headers: { 'retry-after': '60' } });
		if (url.host === 'api.raindrop.io') {
			if (url.pathname === '/rest/v1/raindrops/0') return Response.json({ items: [...drops.values()] });
			const drop = drops.get(Number(url.pathname.split('/').pop()));
			if (!drop) return new Response('{}', { status: 404 });
			if (method === 'PUT') drop.tags = body.tags;
			return Response.json({ item: drop });
		}
		if (url.pathname === '/api/v3/list/') {
			const tags = documents.get(url.searchParams.get('id')!);
			return Response.json({ results: tags ? [{ id: url.searchParams.get('id'), tags: Object.fromEntries(tags.map((name) => [name.toLowerCase(), { name }])) }] : [] });
		}
		if (url.pathname === '/api/v3/bulk_update/') {
			for (const update of body.updates) if (documents.has(update.id)) documents.set(update.id, update.tags);
			return Response.json({ results: body.updates.map((update: { id: string }) => (documents.has(update.id) ? { id: update.id, success: true } : { id: update.id, success: false, error: 'Document not found' })) });
		}
		if (url.pathname === '/api/v2/highlights/5/tags/') {
			if (method === 'POST') highlightTags.push({ id: 8, name: body.name });
			return Response.json({ results: highlightTags });
		}
		if (url.pathname === '/api/v2/highlights/5/tags/7' && method === 'DELETE') {
			highlightTags.splice(0, 1);
			return new Response(null, { status: 204 });
		}
		return new Response('{}', { status: 404 });
	}) as typeof fetch;
	return { drops, documents, highlightTags, calls, fetcher, limit: () => (limit = true) };
}

describe('Raindrop and Readwise tags', () => {
	const env = { RAINDROP_TOKEN: 'r', READWISE_ACCESS_TOKEN: 'w' };
	const doc = 'readwise:document:01m89b1r3qqjp35t89j0h0b4rv';

	test('reads tags from each service, a bookmark by its link too', async () => {
		const { fetcher } = services();
		const items = await readTags(['raindrop:1', 'raindrop:link:https://a.test/two', doc, 'readwise:highlight:5', 'raindrop:9'], { env, fetcher });
		expect(items.map((item) => item.tags)).toEqual([['design'], [], ['AI'], ['quote'], []]);
		expect(items[4].error).toMatch(/nothing at that address/);
	});

	test('saves each bookmark, Reader documents in one request, and a highlight tag by tag', async () => {
		const service = services();
		const result = await commitTags([
			{ ref: 'raindrop:1', add: ['Tools'], remove: ['Design'] },
			{ ref: 'raindrop:link:https://a.test/two', add: ['tools'], remove: [] },
			{ ref: doc, add: ['reading'], remove: [], base: ['AI'] },
			{ ref: 'readwise:document:01m00000000000000000000000', add: ['x'], remove: [], base: [] },
			{ ref: 'readwise:highlight:5', add: ['keep'], remove: ['quote'] }
		], { env, fetcher: service.fetcher });
		expect(service.drops.get(1)!.tags).toEqual(['Tools']);
		expect(service.drops.get(2)!.tags).toEqual(['tools']);
		expect(service.documents.get('01m89b1r3qqjp35t89j0h0b4rv')).toEqual(['AI', 'reading']);
		expect(service.highlightTags.map((tag) => tag.name)).toEqual(['keep']);
		expect(service.calls.filter((call) => call.url === '/api/v3/bulk_update/').length).toBe(1);
		expect(result.groups.map((group) => [group.source, group.dryRun, group.items.map((item) => item.ok)])).toEqual([['raindrop', false, [true, true]], ['readwise', false, [true, false, true]]]);
		expect(result.groups[1].items[1].error).toBe('Document not found');
	});

	test('a preview or the demo never writes, whatever tokens it holds', async () => {
		const service = services();
		const result = await commitTags([{ ref: 'raindrop:1', add: ['tools'], remove: [], base: ['design'] }, { ref: doc, add: ['x'], remove: ['ai'], base: ['AI'] }], { env, fetcher: service.fetcher, dryRun: true });
		expect(service.calls).toEqual([]);
		expect(result.groups).toEqual([
			{ source: 'raindrop', dryRun: true, items: [{ ref: 'raindrop:1', ok: true, tags: ['design', 'tools'] }] },
			{ source: 'readwise', dryRun: true, items: [{ ref: doc, ok: true, tags: ['x'] }] }
		]);
		expect((await commitTags([{ ref: 'raindrop:1', add: ['tools'], remove: [] }], { env: {}, fetcher: service.fetcher })).groups[0].dryRun).toBe(true);
	});

	test('a service asking to slow down leaves the rest for later', async () => {
		const service = services();
		service.limit();
		expect((await readTags(['raindrop:1', doc], { env, fetcher: service.fetcher })).map((item) => item.later)).toEqual([true, true]);
		const result = await commitTags([{ ref: 'raindrop:1', add: ['tools'], remove: [] }], { env, fetcher: service.fetcher });
		expect(result.groups[0].items[0]).toEqual({ ref: 'raindrop:1', ok: false, error: expect.stringMatching(/slow down/) });
	});
});
