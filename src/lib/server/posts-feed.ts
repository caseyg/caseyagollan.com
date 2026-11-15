import { getAllPosts, rollupIndexPosts, type Post } from '$lib/posts';
import { entryFacets, FEED_CHUNK_SIZE, postTags, type FacetEntry, type PostType } from '$lib/posts-filter';

/** The prerendered summary the filtered feed reads instead of parsing every post at request time. */
export interface FeedIndex {
	/** Types, lower-case tags and year of each feed entry, in feed order (newest first). */
	entries: PostType[][];
	tags: string[][];
	years: string[];
	/** Each tag as it is written, by its lower-case form. */
	tagNames: Record<string, string>;
	chunkSize: number;
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

const indexes = new WeakMap<Post[], FeedIndex>();

export function buildFeedIndex(entries: Post[]): FeedIndex {
	let index = indexes.get(entries);
	if (!index) {
		const facets = entries.map(entryFacets);
		const tagNames: Record<string, string> = {};
		for (const post of entries) for (const tag of postTags(post)) tagNames[tag.toLowerCase()] ??= tag;
		index = {
			entries: facets.map((entry) => entry.types),
			tags: facets.map((entry) => entry.tags),
			years: facets.map((entry) => entry.year),
			tagNames,
			chunkSize: FEED_CHUNK_SIZE
		};
		indexes.set(entries, index);
	}
	return index;
}

export function indexFacetEntries(index: FeedIndex): FacetEntry[] {
	return index.entries.map((types, i) => ({ types, tags: index.tags[i], year: index.years[i] }));
}

export function feedChunkCount(entries: { length: number }): number {
	return Math.ceil(entries.length / FEED_CHUNK_SIZE);
}

export function feedChunk(entries: Post[], chunk: number): Post[] {
	return entries.slice(chunk * FEED_CHUNK_SIZE, (chunk + 1) * FEED_CHUNK_SIZE);
}
