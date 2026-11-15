import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import type { Post } from '$lib/posts';
import { facetLabels, facetMenu, facetsHref, matchesFacets, parseFacets } from '$lib/posts-filter';
import { buildFeedIndex, feedChunk, getFeedEntries, indexFacetEntries, type FeedIndex } from '$lib/server/posts-feed';
import { PAGE_SIZE, pageNumber, postsByDayArray } from '$lib/server/posts-page';
import type { PageServerLoad } from './$types';

// Any combination of types, tags and years can be requested, so render on demand from prerendered feed data.
export const prerender = false;

interface FeedSource {
	index(): Promise<FeedIndex>;
	chunk(chunk: number): Promise<Post[]>;
}

let deployedIndex: Promise<FeedIndex> | undefined;

/** Read the deployed static data: parsing every Markdown post per request costs too much CPU. */
function assetSource(assets: Fetcher, origin: string): FeedSource {
	const read = async <T>(path: string): Promise<T> => {
		const response = await assets.fetch(new URL(path, origin));
		if (!response.ok) throw new Error(`Feed data ${path} returned ${response.status}`);
		return response.json() as Promise<T>;
	};
	return {
		// Assets only change with a deploy, which starts a new isolate.
		index: () => (deployedIndex ??= read<FeedIndex>('/posts/feed-data/index.json').catch((cause) => {
			deployedIndex = undefined;
			throw cause;
		})),
		chunk: (chunk) => read<Post[]>(`/posts/feed-data/${chunk}.json`)
	};
}

/** Development has no fresh build output, so read the Markdown directly. */
const localSource: FeedSource = {
	index: async () => buildFeedIndex(await getFeedEntries()),
	chunk: async (chunk) => feedChunk(await getFeedEntries(), chunk)
};

export const load: PageServerLoad = async ({ url, platform }) => {
	const assets = (platform?.env as { ASSETS?: Fetcher } | undefined)?.ASSETS;
	const source = !dev && assets ? assetSource(assets, url.origin) : localSource;

	let index: FeedIndex;
	try {
		index = await source.index();
	} catch (cause) {
		console.error('Could not read feed index', cause);
		error(503, 'Posts temporarily unavailable. Please try again shortly.');
	}

	const facets = parseFacets(url.searchParams);
	const pageParam = url.searchParams.get('page') ?? '1';

	// Each view has one URL: nothing chosen is the static feed, a lone year or tag is its own page.
	const canonical = facetsHref(facets, /^[1-9]\d*$/.test(pageParam) ? Number(pageParam) : 1);
	const target = new URL(canonical, url);
	if (target.pathname !== url.pathname || target.searchParams.toString() !== url.searchParams.toString()) {
		redirect(307, canonical);
	}

	const entries = indexFacetEntries(index);
	const matches: number[] = [];
	entries.forEach((entry, i) => {
		if (matchesFacets(entry, facets)) matches.push(i);
	});
	const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
	const page = pageNumber(pageParam, totalPages);
	const onPage = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	const chunks = new Map<number, Promise<Post[]>>();
	for (const i of onPage) {
		const chunk = Math.floor(i / index.chunkSize);
		if (!chunks.has(chunk)) chunks.set(chunk, source.chunk(chunk));
	}
	let posts: Post[];
	try {
		const loaded = new Map(await Promise.all([...chunks].map(async ([n, p]) => [n, await p] as const)));
		posts = onPage.map((i) => loaded.get(Math.floor(i / index.chunkSize))![i % index.chunkSize]);
	} catch (cause) {
		console.error('Could not read feed data', cause);
		error(503, 'Posts temporarily unavailable. Please try again shortly.');
	}

	return {
		postsByDay: postsByDayArray(posts),
		totalPosts: matches.length,
		page,
		totalPages,
		postsMenu: facetMenu(entries, index.tagNames, facets),
		facets,
		filterLabels: facetLabels(facets, index.tagNames)
	};
};
