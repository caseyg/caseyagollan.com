/**
 * Tags on the site's posts, read and changed many at a time. A post's tags are its Micropub
 * `category`, kept in its Markdown file's front matter in the content repository. A batch of
 * changes is one commit there (all the files or none), made with the same document functions a
 * Micropub update uses: each post gets a new `updated`, and delivery is told as for any edit.
 * Values in `category` that aren't text are never touched.
 */
import { POST_TYPE_PLURALS, type Post } from '../../posts-types';
import { applyEdit, cleanTags, tagSummary, type TagChange, type TagGroupResult, type TagItem } from '../../tag-edits';
import { validPostParams } from '../github-posts';
import type { Fetcher } from './auth';
import { queuePublication } from './delivery';
import { readDocument, updateDocument } from './document';
import { createGitHubStore, GitHubStoreError } from './github';
import { timestamp, type PublishingConfig } from './micropub';

const folders = Object.values(POST_TYPE_PLURALS);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

interface Target { ref: string; date: string; slug: string }

/** `post:/2026/11/14/slug/` as the day and slug its file is named for. */
function target(ref: string): Target | null {
	const match = /^post:\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\/$/.exec(ref);
	if (!match) return null;
	let slug: string;
	try { slug = decodeURIComponent(match[4]); } catch { return null; }
	if (/[%?#/]/.test(slug) || !validPostParams({ year: match[1], month: match[2], day: match[3], slug })) return null;
	return { ref, date: `${match[1]}-${match[2]}-${match[3]}`, slug };
}

/** A file is named for the day it was made, which can be a day either side of the day in its address. */
function candidates({ date, slug }: Target): string[] {
	const ms = Date.parse(`${date}T00:00:00Z`);
	const dates = [date, new Date(ms + 86400000).toISOString().slice(0, 10), new Date(ms - 86400000).toISOString().slice(0, 10)];
	return folders.flatMap((folder) => dates.map((day) => `${folder}/${day}-${slug}.md`));
}

const textTags = (values: unknown): string[] => (Array.isArray(values) ? values : values === undefined || values === null ? [] : [values]).filter((value): value is string => typeof value === 'string' && !!value.trim());

type Store = ReturnType<typeof createGitHubStore>;
interface Found { target: Target; file?: { path: string; content: string }; error?: string }

/** Each post's file, found with one tree request and one read for all of them. */
async function findFiles(store: Store, refs: readonly string[]): Promise<Found[]> {
	const targets = refs.map((ref) => ({ ref, target: target(ref) }));
	const paths = await store.paths();
	if (!paths) throw new GitHubStoreError('unavailable');
	const wanted = [...new Set(targets.flatMap(({ target }) => (target ? candidates(target).filter((path) => paths.has(path)) : [])))];
	const files = new Map((await store.readMany(wanted)).map((file) => [file.path, file]));
	return targets.map(({ ref, target }): Found => {
		if (!target) return { target: { ref, date: '', slug: '' }, error: 'That isn’t a post’s address.' };
		const matches = candidates(target).map((path) => files.get(path)).filter((file) => {
			if (!file) return false;
			try { return String(readDocument(file.content).properties.published?.[0] ?? '').startsWith(target.date); } catch { return false; }
		});
		if (matches.length > 1) return { target, error: 'More than one file shares that address.' };
		return matches[0] ? { target, file: matches[0] } : { target, error: 'No post is at that address (it may have moved).' };
	});
}

export interface PostTagDeps {
	fetcher?: Fetcher;
	now?: () => Date;
	/** The posts built into this deployment, read where the content repository can't be. */
	bundled?: () => Promise<Post[]>;
}

const store = (config: PublishingConfig, deps: PostTagDeps) => createGitHubStore(config, deps.fetcher);
const storeError = (error: unknown) => (error instanceof GitHubStoreError ? (error.outcome === 'conflict' ? 'The content repository changed while this was saving. Nothing was written; save again.' : error.outcome === 'unknown' ? 'GitHub didn’t answer, so the commit may or may not have been made. Check the repository before saving again.' : 'GitHub couldn’t be reached. Nothing was written.') : null);

function bundledPost(posts: Post[], ref: string): Post | undefined {
	const wanted = target(ref);
	return wanted ? posts.find((post) => post.slug === wanted.slug && post.date.startsWith(wanted.date) && !post.deleted) : undefined;
}

/**
 * Posts' tags as they are now: from the content repository where publishing is set up (so a save
 * shows at once, before the site rebuilds), else from the posts this deployment was built with.
 */
export async function readPostTags(config: PublishingConfig | undefined, refs: readonly string[], deps: PostTagDeps = {}): Promise<TagItem[]> {
	if (!refs.length) return [];
	if (!config) {
		const posts = (await deps.bundled?.()) ?? [];
		return refs.map((ref) => {
			const post = bundledPost(posts, ref);
			return post ? { ref, tags: textTags(post.category) } : { ref, tags: [], error: 'No post is at that address.' };
		});
	}
	try {
		return (await findFiles(store(config, deps), refs)).map(({ target, file, error }) => {
			if (!file) return { ref: target.ref, tags: [], error };
			const properties = readDocument(file.content).properties;
			return properties.deleted?.[0] === true ? { ref: target.ref, tags: [], error: 'This post was deleted.' } : { ref: target.ref, tags: textTags(properties.category) };
		});
	} catch (error) {
		const message = storeError(error);
		if (!message) throw error;
		return refs.map((ref) => ({ ref, tags: [], later: true }));
	}
}

/** The Micropub update that makes `tags` what `change` asks: only what differs, spelled as stored. */
function operations(tags: string[], change: TagChange) {
	const add = cleanTags(change.add).filter((tag) => !tags.some((one) => same(one, tag)));
	const remove = tags.filter((tag) => cleanTags(change.remove).some((one) => same(one, tag)));
	return { add, remove };
}

/**
 * Saves tag changes to posts as one commit. Without a publishing configuration (a preview, the
 * demo) nothing is written: the result says what the commit would have held (`dryRun`).
 */
export async function commitPostTags(config: PublishingConfig | undefined, changes: readonly TagChange[], deps: PostTagDeps & { message?: string } = {}): Promise<TagGroupResult> {
	const headline = (edits: { add: string[]; remove: string[] }[]) => deps.message?.replace(/\s+/g, ' ').trim().slice(0, 120) || tagSummary(edits);
	if (!config) {
		const posts = (await deps.bundled?.()) ?? [];
		const items = changes.map((change) => {
			const post = bundledPost(posts, change.ref);
			return post ? { ref: change.ref, ok: true, tags: applyEdit(textTags(post.category), operations(textTags(post.category), change)) } : { ref: change.ref, ok: false, error: 'No post is at that address.' };
		});
		return { source: 'post', dryRun: true, message: headline(changes.filter((_, index) => items[index].ok)), items };
	}
	const github = store(config, deps);
	try {
		// Captured before the files are read: any commit in between refuses this one.
		const expectedHead = await github.head();
		const found = await findFiles(github, changes.map((change) => change.ref));
		const now = timestamp(deps.now?.() ?? new Date(), config.timeZone);
		const writes: { path: string; content: string; previous: string; edit: { add: string[]; remove: string[] } }[] = [];
		const items = found.map(({ target, file, error }, index): TagGroupResult['items'][number] => {
			if (!file) return { ref: target.ref, ok: false, error };
			try {
				const properties = readDocument(file.content).properties;
				if (properties.deleted?.[0] === true) return { ref: target.ref, ok: false, error: 'This post was deleted.' };
				const tags = textTags(properties.category);
				const edit = operations(tags, changes[index]);
				if (!edit.add.length && !edit.remove.length) return { ref: target.ref, ok: true, tags };
				if (writes.some((write) => write.path === file.path)) return { ref: target.ref, ok: false, error: 'This post is in the batch twice.' };
				const tagged = updateDocument(file.content, { ...(edit.add.length ? { add: { category: edit.add } } : {}), ...(edit.remove.length ? { delete: { category: edit.remove } } : {}) });
				writes.push({ path: file.path, content: updateDocument(tagged, { replace: { updated: [now] } }), previous: file.content, edit });
				return { ref: target.ref, ok: true, tags: applyEdit(tags, edit) };
			} catch {
				return { ref: target.ref, ok: false, error: 'This post’s front matter couldn’t be read.' };
			}
		});
		if (!writes.length) return { source: 'post', dryRun: false, items };
		const message = headline(writes.map((write) => write.edit));
		const body = ['Batch tag edit from /tables.', '', ...writes.map((write) => `${write.path}: ${[...write.edit.add.map((tag) => `+${tag}`), ...write.edit.remove.map((tag) => `−${tag}`)].join(' ')}`)].join('\n');
		const saved = await github.writeMany(writes.map(({ path, content }) => ({ path, content })), { expectedHead, message, body });
		// Delivery hears of each post as it does after any edit; what it misses, the next manifest scan recovers.
		for (const write of writes) await queuePublication(config, write.path, write.content, write.previous, saved.commit).catch(() => false);
		return { source: 'post', dryRun: false, commit: { sha: saved.commit, url: `https://github.com/${config.owner}/${config.repo}/commit/${saved.commit}` }, message, items };
	} catch (error) {
		const message = storeError(error);
		if (!message) throw error;
		return { source: 'post', dryRun: false, error: message, items: changes.map((change) => ({ ref: change.ref, ok: false })) };
	}
}
