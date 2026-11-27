import type { RegistrySkill, Skill, SkillProposal } from '$lib/chat-skills';
import { memorySkills } from '$lib/chat-skills-client';

/** Sample skills for the Skills stories. */
const at = Date.UTC(2026, 10, 25, 15);
export const roundup: Skill = {
	name: 'link-roundup', enabled: true, origin: 'custom', updatedAt: at,
	description: 'Write a link roundup post from recent bookmarks and likes. Use whenever Casey asks for a roundup, a links post, or “what I’ve been reading”.',
	instructions: '# Link roundup\n\nA roundup is a short article that gathers a week of links under a few themes, so readers get the thread between them and not a list.\n\n1. Find the week’s bookmarks and likes: one `search_site` with `days: 7`.\n2. Group them into two to four themes. Leave out anything that doesn’t fit one.\n3. Write a sentence or two per link, in Casey’s voice, saying why it was worth saving.\n4. Save it as a draft with `micropub_create_post`, and say what you left out.\n\n## Format\n\n```markdown\n## Theme\n\n- [Title](url): why it matters.\n```'
};
export const skills: Skill[] = [
	{ name: 'skill-creator', enabled: true, origin: 'builtin', updatedAt: 0, source: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator', description: 'Write a new skill for this chat, or improve one Casey already has. Use when Casey asks to make, draft, change or fix a skill, or to turn what was just done into a skill.', instructions: '# Skill creator\n\nA skill is a set of instructions Casey saves for one kind of work in this chat…' },
	{ name: 'find-skills', enabled: true, origin: 'builtin', updatedAt: 0, source: 'https://www.skills.sh/vercel-labs/skills/find-skills', description: 'Find published skills on skills.sh and offer to install one. Use when Casey asks whether there is a skill for something, or wants to find or install a skill.', instructions: '# Find skills\n\nFind a skill someone has already published…' },
	roundup,
	{ name: 'humanizer', enabled: false, origin: 'installed', updatedAt: at, source: 'https://skills.sh/blader/humanizer/humanizer', description: 'Remove signs of AI-generated writing from text. Use when editing or reviewing text to make it sound more natural.', instructions: '# Humanizer\n\nYou are a writing editor…', files: { 'references/patterns.md': '# Patterns\n\n…' } }
];
export const registry: (RegistrySkill & { skill?: Pick<Skill, 'description' | 'instructions'> })[] = [
	{ id: 'anthropics/skills/doc-coauthoring', name: 'doc-coauthoring', source: 'anthropics/skills', installs: 412_000, url: 'https://skills.sh/anthropics/skills/doc-coauthoring', skill: { description: 'Guide users through a structured workflow for co-authoring documentation. Use when writing docs, proposals or specs.', instructions: '# Doc co-authoring\n\nWork in three stages: gather context, refine the structure, then test the draft on a reader.\n\n## Stage 1: Context\n\nAsk what the document is for and who reads it…' } },
	{ id: 'blader/humanizer/humanizer', name: 'humanizer', source: 'blader/humanizer', installs: 96_000, url: 'https://skills.sh/blader/humanizer/humanizer' },
	{ id: 'someone/kit/doc-voice', name: 'doc-voice', source: 'someone/kit', installs: 84, url: 'https://skills.sh/someone/kit/doc-voice' }
];
/** A repository of skills, as fetching `acme/writing-kit` finds it: the set card's stories and the manager's. */
export const kit: (RegistrySkill & { skill?: Pick<Skill, 'description' | 'instructions'> })[] = [
	{ id: 'acme/writing-kit/changelog', name: 'changelog', source: 'acme/writing-kit', installs: 2100, url: 'https://github.com/acme/writing-kit/tree/HEAD/plugins/release/skills/changelog', skill: { description: 'Write a changelog entry from what changed. Use for release notes and “what’s new” posts.', instructions: '# Changelog\n\n1. List what changed, newest first.\n2. Say each change in a sentence a reader would care about.\n3. Group them under Added, Changed and Fixed.' } },
	{ id: 'acme/writing-kit/plain-language', name: 'plain-language', source: 'acme/writing-kit', installs: 900, url: 'https://github.com/acme/writing-kit/tree/HEAD/plugins/editing/skills/plain-language', skill: { description: 'Rewrite a draft in plain language without losing its meaning.', instructions: '# Plain language\n\nShort sentences. Common words. One idea each.' } },
	{ id: 'acme/writing-kit/link-roundup', name: 'link-roundup', source: 'acme/writing-kit', installs: 300, url: 'https://github.com/acme/writing-kit/tree/HEAD/plugins/editing/skills/link-roundup', skill: { description: 'Gather a week of links into a short post.', instructions: '# Link roundup\n\nGroup the links under themes.' } }
];
const SET_AT = at;
/** The three of them, set aside for review. */
export const kitProposals: SkillProposal[] = kit.map((one, index) => ({
	id: `set${index}`.padEnd(12, '0'), createdAt: SET_AT,
	skill: { name: one.name, description: one.skill!.description, instructions: one.skill!.instructions, enabled: true, origin: 'installed', source: one.url, updatedAt: SET_AT },
	notes: ['This was written by someone else. Read it before adding it: the assistant will follow it whenever it is used.', `From the plugin “${index === 0 ? 'release' : 'editing'}”.`],
	...(one.name === 'link-roundup' ? { replaces: 'link-roundup' } : {})
}));
export const kitNotes = ['This is a plugin marketplace. Only the skills in its plugins can be added: this chat can’t run a plugin’s commands, agents, hooks or MCP servers.', '1 of its plugins is kept in other repositories and was not read: deploy-tools.'];

/** A published skill fetched for review, with the notes a long one with scripts gets. */
export const proposal: SkillProposal = {
	id: 'demo00000000', createdAt: at,
	skill: { name: 'doc-coauthoring', enabled: true, origin: 'installed', source: 'https://skills.sh/anthropics/skills/doc-coauthoring', updatedAt: at, description: registry[0].skill!.description, instructions: registry[0].skill!.instructions, files: { 'references/checklist.md': '# Checklist\n\n- Who is it for?\n- What should they do after reading?' } },
	notes: ['This was written by someone else. Read it before adding it: the assistant will follow it whenever it is used.', '2 other files in the skill’s folder (scripts, assets) were left behind: this chat can’t run scripts, so steps that depend on them won’t work.']
};
export const drafted: SkillProposal = { id: 'demo00000001', createdAt: at, skill: { ...roundup, updatedAt: at }, notes: [] };
export const client = () => memorySkills(skills, [...registry, ...kit]);
