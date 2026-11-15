import type { MenuOption } from '$lib/components/ui';
import { getAllPosts, rollupIndexPosts, type Post } from '$lib/posts';
import { entryTypes, FEED_CHUNK_SIZE, typeFilterOptions, type PostType } from '$lib/posts-filter';

/** The prerendered summary the filtered feed reads instead of parsing every post at request time. */
export interface FeedIndex {
	/** Types of each feed entry, in feed order (newest first). */
	entries: PostType[][];
	chunkSize: number;
	/** The Posts menu of types and years, carried here so the on-demand filtered feed can show it. */
	menu?: MenuOption[];
}

const rolled = new WeakMap<Post[], Post[]>();

/** The main feed's entries. Prerendering reuses one parsed list, so memoise the rollup per list. */
export async function getFeedEntries(): Promise<Post[]> {
	const posts = await getAllPosts();
	let entries = rolled.get(posts);
	if (!entries) {
		entries = rollupIndexPosts(posts);
		rolled.set(posts, entries);
	}
	return entries;
}

export function buildFeedIndex(entries: Post[], menu?: MenuOption[]): FeedIndex {
	return { entries: entries.map(entryTypes), chunkSize: FEED_CHUNK_SIZE, menu };
}

export function feedChunkCount(entries: { length: number }): number {
	return Math.ceil(entries.length / FEED_CHUNK_SIZE);
}

export function feedChunk(entries: Post[], chunk: number): Post[] {
	return entries.slice(chunk * FEED_CHUNK_SIZE, (chunk + 1) * FEED_CHUNK_SIZE);
}

export async function feedTypeOptions() {
	return typeFilterOptions((await getFeedEntries()).map(entryTypes));
}
