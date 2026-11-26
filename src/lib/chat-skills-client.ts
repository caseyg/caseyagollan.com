/**
 * The browser's side of chat skills: what the manager on /account, the composer's slash menu and
 * the chat's review card ask of `/api/chat/skills`. Components take a `SkillsClient`, so stories
 * and tests hand them one that keeps skills in memory instead.
 */
import { checkSkill, type RegistrySkill, type Skill, type SkillProposal, type SkillSummary } from './chat-skills';

export interface SkillsClient {
	list(): Promise<SkillSummary[]>;
	get(name: string): Promise<Skill>;
	/** `previous`: the skill's name before this save, when it is being renamed. */
	save(skill: Pick<Skill, 'name' | 'description' | 'instructions'>, previous?: string): Promise<Skill>;
	enable(name: string, enabled: boolean): Promise<void>;
	remove(name: string): Promise<void>;
	/** Search skills.sh. */
	find(query: string): Promise<RegistrySkill[]>;
	/** Fetch a published skill and set it aside for review. */
	fetch(source: string): Promise<SkillProposal>;
	/** A skill waiting for review; `added` says a missing one was already added (a skill named `named` exists). */
	pending(id: string, named?: string): Promise<SkillProposal | { added: boolean }>;
	add(id: string): Promise<Skill>;
	dismiss(id: string): Promise<void>;
}

const PATH = '/api/chat/skills';
/** Sent on the window when skills change, so an open composer's slash menu reads them again. */
export const SKILLS_CHANGED = 'chat-skills:changed';
const changed = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(SKILLS_CHANGED)); };

async function ask<T>(query: string, body?: unknown): Promise<T> {
	const response = await fetch(`${PATH}${query}`, {
		method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
		headers: body === undefined ? {} : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const answer = await response.json().catch(() => ({})) as T & { error?: string };
	if (!response.ok) throw Object.assign(new Error(answer.error || (response.status === 404 ? 'Sign in as the site’s owner to manage skills.' : 'That didn’t work. Try again.')), { status: response.status, answer });
	return answer;
}

/** Skills as the site keeps them. Only Casey's session gets anything from it. */
export const skillsApi: SkillsClient = {
	list: async () => (await ask<{ skills: SkillSummary[] }>('')).skills,
	get: async (name) => (await ask<{ skill: Skill }>(`?name=${encodeURIComponent(name)}`)).skill,
	save: async (skill, previous) => { const saved = (await ask<{ skill: Skill }>('', { action: 'save', skill, previous })).skill; changed(); return saved; },
	enable: async (name, enabled) => { await ask('', { action: 'enable', name, enabled }); changed(); },
	remove: async (name) => { await ask('', { action: 'delete', name }); changed(); },
	find: async (query) => (await ask<{ results: RegistrySkill[] }>(`?find=${encodeURIComponent(query)}`)).results,
	fetch: async (source) => (await ask<{ proposal: SkillProposal }>('', { action: 'fetch', source })).proposal,
	pending: async (id, named) => {
		try { return (await ask<{ proposal: SkillProposal }>(`?pending=${encodeURIComponent(id)}${named ? `&named=${encodeURIComponent(named)}` : ''}`)).proposal; }
		catch (error) { return { added: !!(error as { answer?: { added?: boolean } }).answer?.added }; }
	},
	add: async (id) => { const skill = (await ask<{ skill: Skill }>('', { action: 'add', pending: id })).skill; changed(); return skill; },
	dismiss: async (id) => { await ask('', { action: 'dismiss', pending: id }); }
};

let listed: Promise<SkillSummary[]> | undefined;
/** The skills that are on, for the composer's slash menu: read once, and again after a change. */
export function enabledSkills(client: SkillsClient = skillsApi): Promise<SkillSummary[]> {
	if (client !== skillsApi) return client.list().then((skills) => skills.filter((skill) => skill.enabled));
	if (!listed) {
		listed = client.list().then((skills) => skills.filter((skill) => skill.enabled)).catch(() => { listed = undefined; return []; });
		window.addEventListener(SKILLS_CHANGED, () => { listed = undefined; }, { once: true });
	}
	return listed;
}

/** Skills kept in memory: for stories, and for trying the manager without an account. */
export function memorySkills(initial: Skill[] = [], registry: (RegistrySkill & { skill?: Pick<Skill, 'description' | 'instructions'> })[] = []): SkillsClient {
	const skills = new Map(initial.map((skill) => [skill.name, { ...skill }]));
	const proposals = new Map<string, SkillProposal>();
	const summary = ({ instructions: _instructions, files, ...rest }: Skill): SkillSummary => ({ ...rest, ...(files ? { fileNames: Object.keys(files) } : {}) });
	const need = (name: string) => { const skill = skills.get(name); if (!skill) throw new Error('That skill isn’t there any more.'); return skill; };
	return {
		list: async () => [...skills.values()].map(summary),
		get: async (name) => ({ ...need(name) }),
		save: async (input, previous) => {
			const checked = checkSkill(input);
			if ('error' in checked) throw new Error(checked.error);
			const old = skills.get(previous ?? input.name);
			if (previous && previous !== input.name) skills.delete(previous);
			const skill: Skill = { ...checked.skill, enabled: old?.enabled ?? true, origin: old?.origin ?? 'custom', ...(old?.source ? { source: old.source } : {}), updatedAt: Date.now() };
			skills.set(skill.name, skill);
			return skill;
		},
		enable: async (name, enabled) => { need(name).enabled = enabled; },
		remove: async (name) => { skills.delete(name); },
		find: async (query) => registry.filter((skill) => skill.name.includes(query.toLowerCase().trim().split(/\s+/)[0] ?? '')).map(({ skill: _skill, ...rest }) => rest),
		fetch: async (source) => {
			const found = registry.find((skill) => source.includes(skill.id) || source.includes(skill.name));
			if (!found) throw new Error('No SKILL.md was found there.');
			const proposal: SkillProposal = {
				id: `demo${proposals.size}`.padEnd(12, '0'),
				skill: { name: found.name, description: found.skill?.description ?? `The ${found.name} skill.`, instructions: found.skill?.instructions ?? `# ${found.name}\n\nFollow these steps.`, enabled: true, origin: 'installed', source: found.url, updatedAt: Date.now() },
				notes: ['This was written by someone else. Read it before adding it: the assistant will follow it whenever it is used.'],
				...(skills.has(found.name) ? { replaces: found.name } : {}),
				createdAt: Date.now()
			};
			proposals.set(proposal.id, proposal);
			return proposal;
		},
		pending: async (id, named) => proposals.get(id) ?? { added: !!(named && skills.has(named)) },
		add: async (id) => {
			const proposal = proposals.get(id);
			if (!proposal) throw new Error('That skill is no longer waiting to be added.');
			proposals.delete(id);
			skills.set(proposal.skill.name, proposal.skill);
			return proposal.skill;
		},
		dismiss: async (id) => { proposals.delete(id); }
	};
}
