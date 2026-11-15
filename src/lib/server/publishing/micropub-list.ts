import { POST_TYPE_PLURALS } from '../../posts-types';

/**
 * Ordering and paging for `q=source` without a URL (the Micropub post-list extension).
 *
 * Posts are ordered newest first by the date in the filename, then by `published`, then by
 * path. Filename dates come from the Git tree, so whole days can be skipped without reading
 * them; only the days around the requested page are read.
 */

export interface ListedFile { path: string; date: string }
export interface ReadPost<T> { path: string; date: string; published: number; value: T }
/** Position of a post in the order, carried opaquely in `after` and `before`. */
export interface Cursor { date: string; published: number; path: string }

const pathPattern = /^([^/]+)\/(\d{4}-\d{2}-\d{2})-(.+)\.md$/u;

export function postTypeFolders(types: string[]): Set<string> | undefined {
	const requested = types.flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean);
	if (!requested.length) return;
	return new Set(requested.map(type => {
		if (!Object.hasOwn(POST_TYPE_PLURALS, type)) throw new Error(`Unknown post type: ${type}`);
		return POST_TYPE_PLURALS[type];
	}));
}

export function listedFiles(paths: Iterable<string>, folders: Set<string>): ListedFile[] {
	const files: ListedFile[] = [];
	for (const path of paths) {
		const match = path.match(pathPattern);
		if (match && folders.has(match[1]) && !/[%?#]/.test(path)) files.push({ path, date: match[2] });
	}
	return files;
}

/** Negative when `a` comes first (is newer). */
export function compare(a: Cursor, b: Cursor): number {
	if (a.date !== b.date) return a.date < b.date ? 1 : -1;
	if (a.published !== b.published) return b.published - a.published;
	return a.path === b.path ? 0 : a.path < b.path ? 1 : -1;
}

export function encodeCursor(post: Cursor): string {
	return btoa(JSON.stringify([post.date, post.published, post.path])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(value: string): Cursor {
	try {
		const [date, published, path] = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
		if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof published === 'number' && typeof path === 'string') return { date, published, path };
	} catch { /* fall through */ }
	throw new Error('Invalid paging cursor');
}

function days(files: ListedFile[]): [string, string[]][] {
	const byDate = new Map<string, string[]>();
	for (const file of files) (byDate.get(file.date) ?? byDate.set(file.date, []).get(file.date)!).push(file.path);
	return [...byDate].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
}

export interface ListOptions { limit: number; offset?: number; after?: Cursor; before?: Cursor }
export interface ListResult<T> { items: ReadPost<T>[]; more: boolean }

/**
 * Reads only the days a page needs. `read` returns the posts of the given paths that should be
 * listed (deleted posts left out), so a page is filled even when some files are skipped.
 */
export async function listPosts<T>(files: ListedFile[], options: ListOptions, read: (paths: string[]) => Promise<ReadPost<T>[]>): Promise<ListResult<T>> {
	const limit = options.limit;
	const all = days(files);

	if (options.before) {
		const before = options.before;
		// Newer posts are toward the front: walk days oldest first from the cursor's day.
		const newer = all.filter(([date]) => date >= before.date).reverse();
		const found: ReadPost<T>[] = [];
		for (let index = 0; index < newer.length && found.length < limit;) {
			const batch: string[] = [];
			while (index < newer.length && (batch.length < limit - found.length || !batch.length)) batch.push(...newer[index++][1]);
			found.push(...(await read(batch)).filter(post => compare(post, before) < 0));
		}
		found.sort(compare);
		// The posts just newer than the cursor, still listed newest first.
		const items = found.slice(Math.max(0, found.length - limit));
		return { items, more: true };
	}

	let start = 0;
	let skip = Math.max(0, options.offset ?? 0);
	if (options.after) {
		const after = options.after;
		while (start < all.length && all[start][0] > after.date) start++;
	} else {
		// Whole days before the offset are skipped by file count, without reading them, so a
		// deleted post in a skipped day still counts toward the offset. `after` is exact.
		while (start < all.length && all[start][1].length <= skip) skip -= all[start++][1].length;
	}
	const found: ReadPost<T>[] = [];
	let index = start;
	while (index < all.length && found.length < skip + limit + 1) {
		const batch: string[] = [];
		while (index < all.length && (batch.length < skip + limit + 1 - found.length || !batch.length)) batch.push(...all[index++][1]);
		const posts = await read(batch);
		found.push(...(options.after ? posts.filter(post => compare(post, options.after!) > 0) : posts));
	}
	found.sort(compare);
	const items = found.slice(skip, skip + limit);
	return { items, more: found.length > skip + limit || index < all.length };
}
