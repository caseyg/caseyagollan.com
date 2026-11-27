/**
 * Chat skills: named sets of instructions the chat's assistant can pick up for a kind of work,
 * in the Agent Skills shape (https://agentskills.io/specification): a `SKILL.md` with a name and
 * a description in its frontmatter, the instructions as its Markdown body, and optional
 * reference files beside it.
 *
 * Casey invokes one with `/name` anywhere in a message, or the assistant picks one by its
 * description (`use_skill`). Shared by the browser (the composer's slash menu, the manager on
 * /account) and the server (`src/lib/server/chat/skills.ts`).
 *
 * A skill is words only. It can't add a tool, widen what a tool does, or change who the chat
 * answers to: those are decided by the server from the session, never from a skill's text.
 */

/** Lowercase words joined by hyphens, as the Agent Skills spec has it; also the slash command. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;
/** About 6,000 tokens of a 32,000-token context. A longer skill is cut here when it is added. */
export const SKILL_INSTRUCTIONS_MAX = 24_000;
/** Reference files kept beside a skill, and how long each may be. Scripts are never kept: the chat can't run them. */
export const SKILL_FILES_MAX = 8;
export const SKILL_FILE_MAX = 20_000;
/** How many skills Casey can keep besides the built-in ones. */
export const SKILLS_MAX = 40;

/** Where a skill came from: shipped with the site, written here, or taken from someone else's repository. */
export type SkillOrigin = 'builtin' | 'custom' | 'installed';

export interface SkillSummary {
	name: string;
	description: string;
	enabled: boolean;
	origin: SkillOrigin;
	/** Where an installed skill was read from (its page on skills.sh or GitHub), or what a built-in one is adapted from. */
	source?: string;
	updatedAt: number;
	/** Names of its reference files. */
	fileNames?: string[];
}

export interface Skill extends SkillSummary {
	instructions: string;
	/** Reference files by path, such as `references/schema.md`: text the assistant reads when the instructions point to it. */
	files?: Record<string, string>;
}

/** A skill put in front of Casey to review: nothing is kept as a skill until Casey adds it. */
export interface SkillProposal {
	id: string;
	skill: Skill;
	/** Things Casey should know before adding it: it was cut short, files were left out, it replaces one. */
	notes: string[];
	/** The name of a skill of Casey's this would replace. */
	replaces?: string;
	createdAt: number;
}

/** What fetching an address set aside: one proposal, or one per skill of a repository or plugin marketplace. */
export interface SkillProposalSet {
	proposals: SkillProposal[];
	notes: string[];
	total: number;
	/** `owner/repo`, when the address was a repository or a marketplace and not one skill. */
	repository?: string;
}

/** What a review card needs before the whole proposal is fetched; safe to keep in a thread. */
export interface SkillReviewRef {
	id: string;
	name: string;
	description: string;
	origin: SkillOrigin;
	source?: string;
	replaces?: boolean;
}

/** A skill someone published, as the skills.sh registry lists it. */
export interface RegistrySkill { id: string; name: string; source: string; installs: number; url: string }

/** A skill name from whatever was typed: “PR Review!” becomes `pr-review`. */
export function skillName(value: unknown): string {
	return String(value ?? '').normalize('NFKD').toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SKILL_NAME_MAX).replace(/-+$/, '');
}

const unquote = (value: string) => {
	const trimmed = value.trim();
	if (/^".*"$/s.test(trimmed)) { try { return String(JSON.parse(trimmed)); } catch { return trimmed.slice(1, -1); } }
	if (/^'.*'$/s.test(trimmed)) return trimmed.slice(1, -1).replace(/''/g, "'");
	return trimmed;
};

/**
 * Read a `SKILL.md`: the `name` and `description` from its YAML frontmatter and the body as the
 * instructions. Only those two keys are read; anything else there (`allowed-tools`, `license`,
 * `metadata`) is dropped, since nothing in a skill file can grant the chat anything.
 */
export function parseSkillFile(text: string): { name?: string; description?: string; instructions: string } {
	const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
	const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
	if (!match) return { instructions: source.trim() };
	const fields: Record<string, string> = {};
	const lines = match[1].split('\n');
	for (let index = 0; index < lines.length; index++) {
		const pair = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[index]);
		if (!pair) continue;
		const [, key, rest] = pair;
		const block = /^([>|])[+-]?\s*$/.exec(rest);
		// A block scalar (`>` or `|`), or a plain value carried over onto indented lines.
		const more: string[] = [];
		while (index + 1 < lines.length && (/^[ \t]+\S/.test(lines[index + 1]) || (block && !lines[index + 1].trim()))) more.push(lines[++index].trim());
		if (block) fields[key] = (block[1] === '|' ? more.join('\n') : more.join(' ').replace(/\s+/g, ' ')).trim();
		else fields[key] = unquote([rest, ...more].join(' '));
	}
	return {
		...(fields.name ? { name: fields.name } : {}),
		...(fields.description ? { description: fields.description } : {}),
		instructions: source.slice(match[0].length).trim()
	};
}

/** A skill as a `SKILL.md`, for exporting and for keeping in another agent's skills folder. */
export function skillFile(skill: Pick<Skill, 'name' | 'description' | 'instructions'>): string {
	return `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.instructions.trim()}\n`;
}

const clean = (value: unknown) => typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : '';

/** Paths a reference file may have: relative, a few folders deep, Markdown or plain text. */
const FILE_PATH = /^(?:[\w.-]+\/){0,3}[\w.-]+\.(?:md|markdown|txt)$/i;

export interface SkillInput { name?: unknown; description?: unknown; instructions?: unknown; files?: unknown }

/**
 * What was typed or fetched, as a skill that can be kept: a valid name, a description, the
 * instructions. Over-long parts are cut and noted rather than refused, so a long skill from
 * elsewhere can still be reviewed.
 */
export function checkSkill(input: SkillInput): { skill: Pick<Skill, 'name' | 'description' | 'instructions' | 'files'>; notes: string[] } | { error: string } {
	const name = typeof input.name === 'string' ? input.name.trim().replace(/^\/+/, '') : '';
	if (!name) return { error: 'Give the skill a name.' };
	if (name.length > SKILL_NAME_MAX || !SKILL_NAME.test(name)) return { error: `A skill’s name is lowercase letters, numbers and hyphens, up to ${SKILL_NAME_MAX} characters, such as “${skillName(name) || 'weekly-review'}”.` };
	const notes: string[] = [];
	let description = clean(input.description).replace(/\s+/g, ' ').trim();
	if (!description) return { error: 'Say what the skill is for and when to use it: the assistant chooses skills by their description.' };
	if (description.length > SKILL_DESCRIPTION_MAX) { description = description.slice(0, SKILL_DESCRIPTION_MAX).trimEnd(); notes.push(`Its description was cut to ${SKILL_DESCRIPTION_MAX.toLocaleString('en-US')} characters.`); }
	let instructions = clean(input.instructions).trim();
	if (!instructions) return { error: 'Write the skill’s instructions.' };
	if (instructions.length > SKILL_INSTRUCTIONS_MAX) {
		notes.push(`Its instructions are ${instructions.length.toLocaleString('en-US')} characters, more than the chat’s model can hold: only the first ${SKILL_INSTRUCTIONS_MAX.toLocaleString('en-US')} are kept.`);
		instructions = instructions.slice(0, SKILL_INSTRUCTIONS_MAX).trimEnd();
	}
	const files: Record<string, string> = {};
	if (input.files && typeof input.files === 'object' && !Array.isArray(input.files)) {
		for (const [path, value] of Object.entries(input.files as Record<string, unknown>)) {
			if (Object.keys(files).length >= SKILL_FILES_MAX) { notes.push(`Only its first ${SKILL_FILES_MAX} reference files are kept.`); break; }
			const words = clean(value).trim();
			if (!FILE_PATH.test(path) || path.includes('..') || !words) continue;
			files[path] = words.length > SKILL_FILE_MAX ? words.slice(0, SKILL_FILE_MAX).trimEnd() : words;
			if (words.length > SKILL_FILE_MAX) notes.push(`${path} was cut to ${SKILL_FILE_MAX.toLocaleString('en-US')} characters.`);
		}
	}
	return { skill: { name, description, instructions, ...(Object.keys(files).length ? { files } : {}) }, notes };
}

/** How many skills one message can bring along: each adds its instructions to what the model reads. */
export const SLASH_MAX = 3;

/**
 * The skills a message invokes: each `/name` in it that stands as a word of its own (at the start
 * or after a space, and not run on into more of a path) and names a skill that can be invoked, in
 * the order written, once each. Anything else with a slash in it (`/2026/11/a-post`, `and/or`,
 * a URL) is just text.
 */
export function slashSkills(text: string, names: readonly string[]): string[] {
	const found: string[] = [];
	for (const match of text.matchAll(/(?<![^\s(])\/([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w/-])/g)) {
		if (names.includes(match[1]) && !found.includes(match[1])) found.push(match[1]);
		if (found.length >= SLASH_MAX) break;
	}
	return found;
}

/** The skills a slash query offers: names starting with it first, then names or descriptions holding it. */
export function matchSkills<T extends Pick<SkillSummary, 'name' | 'description'>>(skills: readonly T[], query: string, limit = 8): T[] {
	const starts = skills.filter((skill) => skill.name.startsWith(query));
	const holds = query ? skills.filter((skill) => !skill.name.startsWith(query) && (skill.name.includes(query) || skill.description.toLowerCase().includes(query))) : [];
	return [...starts, ...holds].slice(0, limit);
}

export const ORIGIN_LABELS: Record<SkillOrigin, string> = { builtin: 'Built in', custom: 'Yours', installed: 'Installed' };
