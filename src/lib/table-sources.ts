import { searchPrivateArena } from './arena-client';
import { loadPagefind, plainExcerpt, type PagefindData } from './pagefind';
import { ARENA_ICON, POST_ICON, type Block, type BlockKind } from './tables';

const PAGE_SIZE = 24;

/** Pages index their heading as the start of their text; a block already shows it. */
function withoutTitle(excerpt: string, title: string): string {
	return excerpt.startsWith(title) ? excerpt.slice(title.length).replace(/^[\s.:·–—-]+/, '') : excerpt;
}

/** Turns one site search result into a block. */
export function blockFromSearch(data: PagefindData): Block {
	const type = data.meta.type ?? '';
	const url = data.url.replace(/^\/+(?=https?:)/, '');
	const title = data.meta.title || url;
	const excerpt = withoutTitle(plainExcerpt(data.excerpt), title) || undefined;
	const image = data.meta.image || undefined;
	if (type === 'book') {
		return { kind: 'book', url, title, meta: [data.meta.author, data.meta.year].filter(Boolean).join(' · ') || undefined, image };
	}
	if (type === 'wiki') {
		// The cag.wiki address, as saved tables keep it; opening the block goes to the wiki browser.
		return { kind: 'wiki', url: data.meta.source ?? new URL(url, 'https://cag.wiki/').href, title, meta: 'cag.wiki', excerpt };
	}
	if (type === 'arena') {
		// Casey's Are.na channels and blocks open on Are.na.
		return { kind: 'arena', url, title, meta: data.meta.detail || 'Are.na', excerpt, image, icon: ARENA_ICON[data.meta.kind ?? ''] };
	}
	const date = data.meta.date?.slice(0, 10);
	return { kind: 'post', url, title, meta: [type, date].filter(Boolean).join(' · ') || undefined, excerpt, image, icon: POST_ICON[type] };
}

export type SourceFilter = 'all' | Extract<BlockKind, 'post' | 'book' | 'wiki' | 'arena'>;

/**
 * Site content matching a query, best first: posts, books, wiki pages and Casey's Are.na. An empty query lists a
 * kind's pages (the whole library, every wiki page, all of Are.na), not everything. Resolves null without a search index.
 */
export async function searchBlocks(query: string, filter: SourceFilter = 'all', limit = PAGE_SIZE): Promise<Block[] | null> {
	const pagefind = await loadPagefind();
	if (!pagefind) return null;
	const term = query.trim() || null;
	if (!term && filter === 'all') return [];
	const filters = filter === 'book' || filter === 'wiki' || filter === 'arena' ? { Type: filter } : undefined;
	const response = await pagefind.search(term, filters ? { filters } : undefined);
	const results = response?.results ?? [];
	const blocks: Block[] = [];
	// Posts have many types, so they are told apart from the rest after loading, a page at a time.
	for (let start = 0; start < results.length && blocks.length < limit; start += limit) {
		const page = await Promise.all(results.slice(start, start + limit).map((result) => result.data()));
		for (const data of page) {
			const block = blockFromSearch(data);
			if (filter === 'all' || block.kind === filter) blocks.push(block);
		}
		if (filter !== 'post') break;
	}
	return blocks.slice(0, limit);
}

/**
 * Site search plus Casey's private Are.na, for the signed-in owner's tables. Private blocks follow the
 * public ones: a few in a search of everything, all of them under the Are.na filter.
 */
export function withPrivateArena(search: typeof searchBlocks = searchBlocks) {
	return async (query: string, filter: SourceFilter = 'all'): Promise<Block[] | null> => {
		const wantPrivate = filter === 'arena' || (filter === 'all' && !!query.trim());
		const [found, hidden] = await Promise.all([search(query, filter), wantPrivate ? searchPrivateArena(query, filter === 'arena' ? PAGE_SIZE : 6) : Promise.resolve([])]);
		if (found === null && !hidden.length) return null;
		return [...(found ?? []), ...hidden];
	};
}
