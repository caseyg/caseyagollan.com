/**
 * The browser's side of tag editing on tables: the tags read for each block, the edits staged on
 * top of them, and saving. One store for the whole page, so the cards on the canvas (mounted one by
 * one inside tldraw) and the tag panel show the same thing. Staged edits are kept in this browser
 * until they are saved or discarded, so a reload or another table doesn't lose them.
 */
import { applyEdit, emptyEdit, stageTags, tagViews, type StagedTags, type TagChange, type TagCommitResult, type TagEdit, type TagItem, type TagSource, type TagView } from './tag-edits';

const STAGED_KEY = 'tag-edits:staged';
const KNOWN_KEY = 'tag-edits:known';
const TITLES_KEY = 'tag-edits:titles';
const FRESH_MS = 60_000;
const RETRY_MS = 65_000;
const MAX_KNOWN = 1500;

interface Known { tags: string[]; error?: string; at: number }

export const tagStore = $state<{
	/** On for whoever can change the table: the owner, or the demo. Off, cards show no tags. */
	enabled: boolean;
	known: Record<string, Known>;
	staged: StagedTags;
	/** What each staged thing is called, so the review can name edits staged on another table. */
	titles: Record<string, string>;
	/** Tags already in use on posts, for the editor to offer. */
	suggestions: string[];
	/** Sources this place can't write to: saving them is a rehearsal. */
	rehearsed: TagSource[];
	/** Refs being read now. */
	reading: Record<string, true>;
	problem: string;
}>({ enabled: false, known: {}, staged: {}, titles: {}, suggestions: [], rehearsed: [], reading: {}, problem: '' });

let csrf = '';
let asked = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let waiting = new Set<string>();

function stored<T>(key: string, fallback: T): T {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
		return value && typeof value === 'object' ? value : fallback;
	} catch {
		return fallback;
	}
}

function keep(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* Full or blocked: staged edits last as long as the page. */
	}
}

function keepStaged() {
	keep(STAGED_KEY, tagStore.staged);
	keep(TITLES_KEY, Object.fromEntries(Object.entries(tagStore.titles).filter(([ref]) => tagStore.staged[ref])));
}

function keepKnown() {
	const entries = Object.entries(tagStore.known).filter(([, known]) => !known.error);
	keep(KNOWN_KEY, Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_KNOWN)));
}

/** Turns tags on for this page: what was staged and last read comes back from this browser. */
export function enableTags(session: { csrf?: string }) {
	csrf = session.csrf ?? '';
	if (tagStore.enabled) return;
	tagStore.staged = stored<StagedTags>(STAGED_KEY, {});
	tagStore.titles = stored<Record<string, string>>(TITLES_KEY, {});
	tagStore.known = stored<Record<string, Known>>(KNOWN_KEY, {});
	tagStore.enabled = true;
}

async function call<T>(body: unknown): Promise<T> {
	const response = await fetch('/api/tags', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) });
	const data = (await response.json().catch(() => ({}))) as T & { error?: string };
	if (!response.ok) throw new Error(data.error || 'Tags couldn’t be reached.');
	return data;
}

/** Reads the tags of refs not read in the last minute. Those a service put off are asked for again later. */
export async function loadTags(refs: readonly string[], force = false): Promise<void> {
	if (!tagStore.enabled) return;
	const now = Date.now();
	const wanted = [...new Set(refs)].filter((ref) => !tagStore.reading[ref] && (force || !tagStore.known[ref] || now - tagStore.known[ref].at > FRESH_MS || tagStore.known[ref].error));
	if (!wanted.length) return;
	for (const ref of wanted) tagStore.reading[ref] = true;
	try {
		const data = await call<{ items: TagItem[]; rehearsed?: TagSource[]; suggestions?: string[] }>({ action: 'read', refs: wanted, suggest: !asked });
		asked = true;
		tagStore.problem = '';
		if (data.suggestions) tagStore.suggestions = data.suggestions;
		if (data.rehearsed) tagStore.rehearsed = data.rehearsed;
		for (const item of data.items) {
			if (item.later) waiting.add(item.ref);
			else tagStore.known[item.ref] = { tags: item.tags, at: Date.now(), ...(item.error ? { error: item.error } : {}) };
		}
		keepKnown();
		if (waiting.size && !retry) {
			retry = setTimeout(() => {
				retry = undefined;
				const again = [...waiting];
				waiting = new Set();
				void loadTags(again, true);
			}, RETRY_MS);
		}
	} catch (error) {
		tagStore.problem = error instanceof Error ? error.message : 'Tags couldn’t be reached.';
	} finally {
		for (const ref of wanted) delete tagStore.reading[ref];
	}
}

/** A ref's tags with its staged edit shown on them; empty until they are read. */
export function tagsOn(ref: string | null): TagView[] {
	if (!ref || !tagStore.enabled) return [];
	return tagViews(tagStore.known[ref]?.tags ?? [], tagStore.staged[ref]);
}

/** Stages adding or removing tags on some refs. Returns how many of them now have a staged edit. */
export function stage(refs: readonly string[], change: { add?: unknown; remove?: unknown }, titles: Record<string, string> = {}): number {
	Object.assign(tagStore.titles, titles);
	const current = Object.fromEntries(refs.map((ref) => [ref, tagStore.known[ref] && !tagStore.known[ref].error ? tagStore.known[ref].tags : undefined]));
	tagStore.staged = stageTags(tagStore.staged, refs, change, current);
	keepStaged();
	return refs.filter((ref) => !emptyEdit(tagStore.staged[ref])).length;
}

/** Drops staged edits: those of some refs, or all of them. */
export function discard(refs?: readonly string[]) {
	const next = { ...tagStore.staged };
	for (const ref of refs ?? Object.keys(next)) delete next[ref];
	tagStore.staged = next;
	keepStaged();
}

export const stagedCount = () => Object.keys(tagStore.staged).length;
export const stagedEdit = (ref: string): TagEdit | undefined => tagStore.staged[ref];
/** The tags a ref will have once its staged edit is saved. */
export const tagsAfter = (ref: string) => applyEdit(tagStore.known[ref]?.tags ?? [], tagStore.staged[ref]);

/**
 * Saves every staged edit. What was written leaves the stage and shows as the thing's tags at
 * once; what failed, and everything in a rehearsal, stays staged.
 */
export async function saveTags(message?: string): Promise<TagCommitResult> {
	const changes: TagChange[] = Object.entries(tagStore.staged).map(([ref, edit]) => ({ ref, add: edit.add, remove: edit.remove, ...(tagStore.known[ref] && !tagStore.known[ref].error ? { base: tagStore.known[ref].tags } : {}) }));
	const result = await call<TagCommitResult>({ action: 'commit', changes, ...(message?.trim() ? { message: message.trim() } : {}) });
	const next = { ...tagStore.staged };
	for (const group of result.groups) {
		if (group.dryRun) continue;
		for (const item of group.items) {
			if (!item.ok) continue;
			delete next[item.ref];
			if (item.tags) tagStore.known[item.ref] = { tags: item.tags, at: Date.now() };
		}
	}
	tagStore.staged = next;
	keepStaged();
	keepKnown();
	return result;
}

/** For stories and tests: sets the store without a server. */
export function seedTags(known: Record<string, string[]>, staged: StagedTags = {}, titles: Record<string, string> = {}) {
	tagStore.enabled = true;
	tagStore.titles = titles;
	tagStore.known = Object.fromEntries(Object.entries(known).map(([ref, tags]) => [ref, { tags, at: Date.now() }]));
	tagStore.staged = staged;
}
