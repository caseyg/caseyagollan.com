/**
 * Reads and saves tags for the things a table holds, wherever they live: the site's posts (one
 * commit to the content repository), Raindrop bookmarks and Readwise. Owner-only; the route decides
 * who is asking. Wherever a place can't be written from here (no publishing configuration, no
 * token: every preview and the demo), saving is a dry run that says what would have been written.
 */
import { applyEdit, cleanTags, MAX_TAG_CHANGES, refSource, TAG_SOURCES, type TagChange, type TagCommitResult, type TagGroupResult, type TagItem, type TagSource } from '$lib/tag-edits';
import type { Post } from '$lib/posts-types';
import type { Fetcher } from './publishing/auth';
import type { PublishingConfig } from './publishing/micropub';
import { commitPostTags, readPostTags } from './publishing/post-tags';
import { changeReadwiseTags, isRateLimited, raindropTags, readwiseTags, SavesError, setRaindropTags, setReaderTags, type SavesEnv } from './saves';

export interface TagDeps {
	env: SavesEnv;
	/** Publishing, where this deployment may write posts; undefined makes posts a dry run. */
	config?: PublishingConfig;
	fetcher?: typeof fetch;
	bundled?: () => Promise<Post[]>;
	now?: () => Date;
	/** Never write to Raindrop or Readwise, whatever tokens are here: a preview, or the demo. */
	dryRun?: boolean;
}

/** The sources a save would only rehearse here, so the review can say so before anything is pressed. */
export function rehearsedSources(deps: TagDeps): TagSource[] {
	return TAG_SOURCES.filter((source) => (source === 'post' ? !deps.config : deps.dryRun || !(source === 'raindrop' ? deps.env.RAINDROP_TOKEN : deps.env.READWISE_ACCESS_TOKEN)));
}

/** Reader's list endpoint takes 20 requests a minute; a read asks for fewer and leaves the rest for the next. */
const READER_READS = 12;
const AT_ONCE = 4;

const saves = (deps: TagDeps) => ({ env: deps.env, fetcher: deps.fetcher });
const bySource = <T extends { ref: string }>(items: readonly T[], source: TagSource) => items.filter((item) => refSource(item.ref) === source);
const problem = (error: unknown) => (error instanceof SavesError ? error.message : 'It couldn’t be reached.');

/** Runs `work` over `items` a few at a time, in order. */
async function pooled<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = [];
	for (let start = 0; start < items.length; start += AT_ONCE) results.push(...(await Promise.all(items.slice(start, start + AT_ONCE).map(work))));
	return results;
}

async function readSaved(deps: TagDeps, ref: string, read: () => Promise<{ tags: string[] }>, state: { limited: boolean }): Promise<TagItem> {
	if (state.limited) return { ref, tags: [], later: true };
	try {
		return { ref, tags: (await read()).tags };
	} catch (error) {
		if (isRateLimited(error)) {
			state.limited = true;
			return { ref, tags: [], later: true };
		}
		return { ref, tags: [], error: problem(error) };
	}
}

/** The tags each ref has now, in the order asked. */
export async function readTags(refs: readonly string[], deps: TagDeps): Promise<TagItem[]> {
	const unique = [...new Set(refs)];
	const of = (source: TagSource) => unique.filter((ref) => refSource(ref) === source);
	const raindrop = { limited: false }, readwise = { limited: false };
	const documents = of('readwise').filter((ref) => ref.startsWith('readwise:document:'));
	const records = of('readwise').filter((ref) => !ref.startsWith('readwise:document:'));
	const [posts, bookmarks, read, recorded] = await Promise.all([
		readPostTags(deps.config, of('post'), { fetcher: deps.fetcher as Fetcher | undefined, bundled: deps.bundled }),
		pooled(of('raindrop'), (ref) => readSaved(deps, ref, () => raindropTags(saves(deps), ref), raindrop)),
		(async () => {
			const items: TagItem[] = [];
			// One at a time: Reader counts every request against a small allowance.
			for (const [index, ref] of documents.entries()) items.push(index < READER_READS ? await readSaved(deps, ref, () => readwiseTags(saves(deps), ref), readwise) : { ref, tags: [], later: true });
			return items;
		})(),
		pooled(records, (ref) => readSaved(deps, ref, () => readwiseTags(saves(deps), ref), readwise))
	]);
	const found = new Map([...posts, ...bookmarks, ...read, ...recorded].map((item) => [item.ref, item]));
	return refs.map((ref) => found.get(ref) ?? { ref, tags: [], error: 'That has no tags to read.' });
}

type Outcome = TagGroupResult['items'][number];
const LATER: Omit<Outcome, 'ref'> = { ok: false, error: 'Not saved yet: the service asked the site to slow down. Save again in a minute.' };

function dryRun(source: TagSource, changes: readonly TagChange[]): TagGroupResult {
	return { source, dryRun: true, items: changes.map((change) => ({ ref: change.ref, ok: true, tags: applyEdit(cleanTags(change.base ?? []), change) })) };
}

async function commitRaindrop(changes: readonly TagChange[], deps: TagDeps): Promise<TagGroupResult> {
	if (deps.dryRun || !deps.env.RAINDROP_TOKEN) return dryRun('raindrop', changes);
	let limited = false;
	const items = await pooled(changes, async (change): Promise<Outcome> => {
		if (limited) return { ref: change.ref, ...LATER };
		try {
			const current = await raindropTags(saves(deps), change.ref);
			const next = applyEdit(current.tags, change);
			if (next.length === current.tags.length && next.every((tag, index) => tag === current.tags[index])) return { ref: change.ref, ok: true, tags: current.tags };
			return { ref: change.ref, ok: true, tags: await setRaindropTags(saves(deps), current.id, next) };
		} catch (error) {
			if (isRateLimited(error)) {
				limited = true;
				return { ref: change.ref, ...LATER };
			}
			return { ref: change.ref, ok: false, error: problem(error) };
		}
	});
	return { source: 'raindrop', dryRun: false, items };
}

async function commitReadwise(changes: readonly TagChange[], deps: TagDeps): Promise<TagGroupResult> {
	if (deps.dryRun || !deps.env.READWISE_ACCESS_TOKEN) return dryRun('readwise', changes);
	const outcomes = new Map<string, Outcome>();
	let limited = false;
	const guard = async (change: TagChange, work: () => Promise<Outcome | void>) => {
		if (limited) return void outcomes.set(change.ref, { ref: change.ref, ...LATER });
		try {
			const outcome = await work();
			if (outcome) outcomes.set(change.ref, outcome);
		} catch (error) {
			if (isRateLimited(error)) limited = true;
			outcomes.set(change.ref, isRateLimited(error) ? { ref: change.ref, ...LATER } : { ref: change.ref, ok: false, error: problem(error) });
		}
	};
	// Reader documents: each one's whole tag list is replaced, fifty documents to a request.
	const updates: { change: TagChange; id: string; tags: string[] }[] = [];
	for (const change of changes.filter((one) => one.ref.startsWith('readwise:document:'))) {
		await guard(change, async () => {
			// The browser read these tags to show them; reading each again would spend Reader's small allowance.
			const tags = change.base ? cleanTags(change.base) : (await readwiseTags(saves(deps), change.ref)).tags;
			updates.push({ change, id: change.ref.slice('readwise:document:'.length), tags: applyEdit(tags, change) });
		});
	}
	for (let start = 0; start < updates.length; start += 50) {
		const batch = updates.slice(start, start + 50);
		try {
			const saved = limited ? [] : await setReaderTags(saves(deps), batch.map(({ id, tags }) => ({ id, tags })));
			batch.forEach(({ change, tags }, index) => outcomes.set(change.ref, limited ? { ref: change.ref, ...LATER } : saved[index]?.ok ? { ref: change.ref, ok: true, tags } : { ref: change.ref, ok: false, error: saved[index]?.error ?? 'Readwise didn’t save this.' }));
		} catch (error) {
			if (isRateLimited(error)) limited = true;
			for (const { change } of batch) outcomes.set(change.ref, isRateLimited(error) ? { ref: change.ref, ...LATER } : { ref: change.ref, ok: false, error: problem(error) });
		}
	}
	for (const change of changes.filter((one) => !one.ref.startsWith('readwise:document:'))) {
		await guard(change, async () => ({ ref: change.ref, ok: true, tags: await changeReadwiseTags(saves(deps), change.ref, { add: cleanTags(change.add), remove: cleanTags(change.remove) }) }));
	}
	return { source: 'readwise', dryRun: false, items: changes.map((change) => outcomes.get(change.ref) ?? { ref: change.ref, ok: false, error: 'Not saved.' }) };
}

/**
 * Saves staged changes: posts in one commit, then Raindrop, then Readwise. A source's failure
 * leaves the others' results standing; whatever isn't `ok` stays staged in the browser.
 */
export async function commitTags(changes: readonly TagChange[], deps: TagDeps & { message?: string }): Promise<TagCommitResult> {
	const groups: TagGroupResult[] = [];
	for (const source of TAG_SOURCES) {
		const all = bySource(changes, source).filter((change, index, list) => list.findIndex((one) => one.ref === change.ref) === index);
		if (!all.length) continue;
		const now = all.slice(0, MAX_TAG_CHANGES);
		let group: TagGroupResult;
		try {
			group = source === 'post' ? await commitPostTags(deps.config, now, { fetcher: deps.fetcher as Fetcher | undefined, bundled: deps.bundled, now: deps.now, message: deps.message }) : source === 'raindrop' ? await commitRaindrop(now, deps) : await commitReadwise(now, deps);
		} catch (error) {
			console.warn('Tag save failed', source, error);
			group = { source, dryRun: false, error: 'Something went wrong. Nothing here was saved.', items: now.map((change) => ({ ref: change.ref, ok: false })) };
		}
		group.items.push(...all.slice(MAX_TAG_CHANGES).map((change) => ({ ref: change.ref, ok: false, error: `Left for the next save: one save carries ${MAX_TAG_CHANGES}.` })));
		groups.push(group);
	}
	return { groups };
}

/** Tags Casey already uses on posts, most used first, for the editor to suggest. */
export function postTagSuggestions(posts: readonly Post[], limit = 300): string[] {
	const counts = new Map<string, number>();
	for (const post of posts) for (const tag of Array.isArray(post.category) ? post.category : post.category ? [post.category] : []) if (typeof tag === 'string' && tag.trim()) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([tag]) => tag);
}
