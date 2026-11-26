/**
 * Tags, read and changed from a table. A block can stand for something that has tags somewhere
 * else: one of the site's posts (its Micropub `category`, kept in the content repository), a
 * Raindrop bookmark, or something in Readwise (a Reader document, a highlight, a highlighted book).
 * Changes are staged in the browser first; nothing is written until Casey reviews and saves them.
 * Shared by the browser, the `/api/tags` route and the chat.
 */
import { POST_PATH } from './table-post-source';
import type { Block } from './tables';

export type TagSource = 'post' | 'raindrop' | 'readwise';
export const TAG_SOURCES: readonly TagSource[] = ['post', 'raindrop', 'readwise'];
export const TAG_SOURCE_NAME: Record<TagSource, string> = { post: 'Posts', raindrop: 'Raindrop', readwise: 'Readwise' };
/** Where a source's tags are written, as the review says it. */
export const TAG_DESTINATION: Record<TagSource, string> = { post: 'One commit to the content repository on GitHub', raindrop: 'Saved to Raindrop', readwise: 'Saved to Readwise' };

/** The most that one save carries, per source: a commit's files, and what the services take in a minute. */
export const MAX_TAG_CHANGES = 100;
const MAX_TAG = 80;

/**
 * What a block keeps so its tags can be found again: `raindrop:<id>`, `readwise:document:<id>`,
 * `readwise:highlight:<id>` or `readwise:book:<id>`. Posts need none: their address is enough.
 */
const STORED_REF = /^(?:raindrop:\d{1,20}|readwise:document:[0-9a-z]{20,40}|readwise:(?:highlight|book):\d{1,20})$/;
export const storedRef = (value: unknown): string | undefined => (typeof value === 'string' && STORED_REF.test(value) ? value : undefined);

/** A site post's path as its ref spells it: `/2026/11/14/slug/`. */
const postRefPath = (url: string) => url.replace(/[?#].*$/, '').replace(/\/?$/, '/');

/**
 * What a block's tags belong to, or null for blocks with none to edit (books, wiki pages, Are.na,
 * plain links, pieces cut from a page). A Raindrop bookmark set down before blocks kept their id is
 * found again by its link (`raindrop:link:<url>`).
 */
export function tagRef(block: Pick<Block, 'kind' | 'url' | 'ref'>): string | null {
	const stored = storedRef(block.ref);
	if (stored) return stored;
	if ((block.kind === 'post' || block.kind === 'link') && POST_PATH.test(block.url)) return `post:${postRefPath(block.url)}`;
	if (block.kind === 'raindrop' && /^https?:\/\//i.test(block.url)) return `raindrop:link:${block.url}`;
	return null;
}

export function refSource(ref: string): TagSource | null {
	const source = ref.slice(0, ref.indexOf(':'));
	return source === 'post' || source === 'raindrop' || source === 'readwise' ? source : null;
}

/** A ref the server will look up: a stored one, a post path, or a Raindrop link. */
export function validRef(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 2100) return false;
	if (STORED_REF.test(value)) return true;
	if (value.startsWith('post:')) return POST_PATH.test(value.slice(5));
	return /^raindrop:link:https?:\/\/\S+$/i.test(value);
}

/** A tag as typed: no `#`, no commas or line breaks, single spaces. */
export function cleanTag(value: unknown): string {
	return typeof value === 'string' ? value.replace(/[\r\n,]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '').slice(0, MAX_TAG).trim() : '';
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const has = (tags: readonly string[], tag: string) => tags.some((one) => same(one, tag));

/** Tags cleaned, split at commas, and each kept once (whatever its capitals). */
export function cleanTags(values: unknown): string[] {
	const tags: string[] = [];
	for (const value of Array.isArray(values) ? values : [values]) {
		for (const part of typeof value === 'string' ? value.split(',') : []) {
			const tag = cleanTag(part);
			if (tag && !has(tags, tag)) tags.push(tag);
		}
	}
	return tags;
}

/** Tags to put on and take off one thing. */
export interface TagEdit { add: string[]; remove: string[] }
/** Every edit waiting to be saved, by ref. */
export type StagedTags = Record<string, TagEdit>;

export const emptyEdit = (edit: TagEdit | undefined) => !edit || (!edit.add.length && !edit.remove.length);

/** The tags something will have once its edit is saved: removals first, additions at the end. */
export function applyEdit(tags: readonly string[], edit?: TagEdit): string[] {
	if (!edit) return [...tags];
	const kept = tags.filter((tag) => !has(edit.remove, tag));
	return [...kept, ...edit.add.filter((tag) => !has(kept, tag))];
}

/**
 * Stages a change for some refs on top of what is already staged. Adding a tag that was about to be
 * removed (or the other way round) undoes that instead; where a thing's tags are known (`current`),
 * adding one it has or removing one it lacks stages nothing.
 */
export function stageTags(staged: StagedTags, refs: readonly string[], change: { add?: unknown; remove?: unknown }, current: Record<string, readonly string[] | undefined> = {}): StagedTags {
	const add = cleanTags(change.add ?? []);
	const remove = cleanTags(change.remove ?? []).filter((tag) => !has(add, tag));
	const next: StagedTags = { ...staged };
	for (const ref of refs) {
		const edit = { add: [...(next[ref]?.add ?? [])], remove: [...(next[ref]?.remove ?? [])] };
		const tags = current[ref];
		for (const tag of add) {
			if (has(edit.remove, tag)) edit.remove = edit.remove.filter((one) => !same(one, tag));
			else if (!has(edit.add, tag) && !(tags && has(tags, tag))) edit.add.push(tag);
		}
		for (const tag of remove) {
			if (has(edit.add, tag)) edit.add = edit.add.filter((one) => !same(one, tag));
			else if (!has(edit.remove, tag) && (!tags || has(tags, tag))) edit.remove.push(tags?.find((one) => same(one, tag)) ?? tag);
		}
		if (emptyEdit(edit)) delete next[ref];
		else next[ref] = edit;
	}
	return next;
}

/** One tag as a card or the review shows it: as it is, about to be added, or about to be removed. */
export interface TagView { name: string; state: 'kept' | 'added' | 'removed' }

export function tagViews(tags: readonly string[], edit?: TagEdit): TagView[] {
	return [
		...tags.map((name): TagView => ({ name, state: edit && has(edit.remove, name) ? 'removed' : 'kept' })),
		...(edit?.add ?? []).filter((name) => !has(tags, name)).map((name): TagView => ({ name, state: 'added' }))
	];
}

/** A tag across a selection: how many of the selected things will have it, and whether that is a staged change. */
export interface TagTally { name: string; count: number; total: number; state: 'kept' | 'added' | 'removed' | 'mixed' }

/** The tags of several things together, most shared first, with staged changes marked. */
export function tallyTags(targets: readonly { tags?: readonly string[]; edit?: TagEdit }[]): TagTally[] {
	const rows = new Map<string, { name: string; count: number; states: Set<TagView['state']> }>();
	for (const target of targets) {
		for (const view of tagViews(target.tags ?? [], target.edit)) {
			const key = view.name.toLowerCase();
			const row = rows.get(key) ?? { name: view.name, count: 0, states: new Set() };
			if (view.state !== 'removed') row.count++;
			row.states.add(view.state);
			rows.set(key, row);
		}
	}
	return [...rows.values()]
		.map((row): TagTally => ({ name: row.name, count: row.count, total: targets.length, state: row.states.size === 1 ? [...row.states][0] : row.states.has('added') && !row.states.has('removed') ? 'added' : row.states.has('removed') && !row.states.has('added') && row.count === 0 ? 'removed' : 'mixed' }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** What `/api/tags` reads for one ref. */
export interface TagItem {
	ref: string;
	tags: string[];
	/** Not read this time (a service asking to slow down): ask again in a minute. */
	later?: boolean;
	error?: string;
}

/** One change sent to be saved. `base`: the tags the browser last read, used where reading again is slow. */
export interface TagChange extends TagEdit { ref: string; base?: string[] }

export interface TagGroupResult {
	source: TagSource;
	/** Nothing was written: this place can't write there (a preview, the demo, or no token). */
	dryRun: boolean;
	/** The commit that holds the posts' changes. */
	commit?: { sha: string; url: string };
	/** The commit message, written or (in a dry run) as it would be. */
	message?: string;
	error?: string;
	items: { ref: string; ok: boolean; tags?: string[]; error?: string }[];
}

export interface TagCommitResult { groups: TagGroupResult[] }

/** `Tag 3 posts: +indieweb +tables −misc`, the first line of the commit and of the review. */
export function tagSummary(changes: readonly TagEdit[], noun = 'post'): string {
	const add: string[] = [], remove: string[] = [];
	for (const change of changes) {
		for (const tag of change.add) if (!has(add, tag)) add.push(tag);
		for (const tag of change.remove) if (!has(remove, tag)) remove.push(tag);
	}
	const parts = [...add.map((tag) => `+${tag}`), ...remove.map((tag) => `−${tag}`)];
	const head = `Tag ${changes.length} ${noun}${changes.length === 1 ? '' : 's'}`;
	let line = head;
	for (const [index, part] of parts.entries()) {
		const next = `${line}${index ? ' ' : ': '}${part}`;
		if (next.length > 68) return `${line}${index ? ' …' : ''}`;
		line = next;
	}
	return line;
}

/** Staged edits by where they are written, in the order the review lists them. */
export function groupStaged(staged: StagedTags): { source: TagSource; refs: string[] }[] {
	return TAG_SOURCES.map((source) => ({ source, refs: Object.keys(staged).filter((ref) => refSource(ref) === source) })).filter((group) => group.refs.length);
}
