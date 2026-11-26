import { searchPrivateArena, searchRaindrop } from './arena-client';
import { loadPagefind, plainExcerpt, type PagefindData } from './pagefind';
import { blockFromPost, fetchSourcePost, isSitePostLink, SOURCE_POST_TYPES } from './table-post-source';
import { ARENA_ICON, linkBlock, POST_ICON, type Block, type BlockKind } from './tables';

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

export type SourceFilter = 'all' | Extract<BlockKind, 'post' | 'book' | 'wiki' | 'arena' | 'raindrop'>;

/**
 * Site content matching a query, best first: posts, books, wiki pages and Casey's Are.na. An empty query lists a
 * kind's pages (the whole library, every wiki page, all of Are.na), not everything. Resolves null without a search index.
 */
export async function searchBlocks(query: string, filter: SourceFilter = 'all', limit = PAGE_SIZE): Promise<Block[] | null> {
	const pagefind = await loadPagefind();
	if (!pagefind) return null;
	const term = query.trim() || null;
	if ((!term && filter === 'all') || filter === 'raindrop') return [];
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
 * Site search plus what only the signed-in owner sees: private Are.na blocks and Raindrop bookmarks.
 * They follow the public results: a few each in a search of everything, all of them under their own filter.
 */
export function withOwnerSources(search: typeof searchBlocks = searchBlocks, sources = { arena: searchPrivateArena, raindrop: searchRaindrop }) {
	return async (query: string, filter: SourceFilter = 'all'): Promise<Block[] | null> => {
		const everything = filter === 'all' && !!query.trim();
		const extra = (source: 'arena' | 'raindrop') => (filter === source ? sources[source](query, PAGE_SIZE) : everything ? sources[source](query, 6) : Promise.resolve([]));
		const [found, arena, raindrop] = await Promise.all([filter === 'raindrop' ? Promise.resolve([]) : search(query, filter), extra('arena'), extra('raindrop')]);
		if (found === null && !arena.length && !raindrop.length) return null;
		return [...(found ?? []), ...arena, ...raindrop];
	};
}

const samePage = (a: string, b: string) => a.replace(/[?#].*$/, '').replace(/\/+$/, '') === b.replace(/[?#].*$/, '').replace(/\/+$/, '');

/** An Are.na address without its scheme, `www.` or trailing slash, so links typed any way match the index's. */
const arenaKey = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

/** One of Casey's Are.na channels, by address: the words its slug spells, which search finds it by. */
export function arenaChannelWords(url: string): string | null {
	const match = /^(?:https?:\/\/)?(?:www\.)?are\.na\/([^/?#]+)\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(url.trim());
	if (!match || match[1] === 'block' || match[1] === 'channel') return null;
	return decodeURIComponent(match[2]).replace(/-[a-z0-9]{6,}$/i, (tail) => (/\d/.test(tail) ? '' : tail)).replace(/[-_]+/g, ' ').trim() || null;
}

interface Richer {
	post?: typeof fetchSourcePost;
	search?: typeof searchBlocks;
	privateArena?: typeof searchPrivateArena;
}

/**
 * The rich block a plain link block stands for, or null when it stands for nothing richer: a link to
 * one of the site's notes, replies, likes or reposts becomes that post (its `source.json`), and a
 * link to one of Casey's Are.na channels becomes the channel as search has it, private ones for the owner.
 */
export async function richerBlock(block: Block, { post = fetchSourcePost, search = searchBlocks, privateArena = searchPrivateArena }: Richer = {}): Promise<Block | null> {
	if (block.kind !== 'link') return null;
	if (isSitePostLink(block)) {
		const found = await post(block.url).catch(() => null);
		return found && SOURCE_POST_TYPES.has(found.type) ? blockFromPost(found, block.url) : null;
	}
	const words = arenaChannelWords(block.url);
	if (!words) return null;
	const key = arenaKey(block.url);
	const matches = (found: Block[] | null | undefined) => found?.find((candidate) => candidate.kind === 'arena' && arenaKey(candidate.url) === key) ?? null;
	return matches(await search(words, 'arena', 24).catch(() => null)) ?? matches(await privateArena(words, 24).catch(() => []));
}

/**
 * A link as a block. One of the site's posts or Casey's Are.na channels comes back drawn as itself
 * (`richerBlock`); another page on this site that its search finds by one of `find` (its title, its
 * first words) comes back as the same rich block the Add menu gives: picture, type and excerpt.
 * Anything else, or a page the search doesn't find, is a plain link block.
 */
export async function linkedBlock(url: string, find: readonly string[] = [], origin?: string, search: typeof searchBlocks = searchBlocks, richer: Omit<Richer, 'search'> = {}): Promise<Block | null> {
	const link = linkBlock(url, origin);
	if (!link) return link;
	const rich = await richerBlock(link, { ...richer, search });
	if (rich || !link.url.startsWith('/')) return rich ?? link;
	for (const words of find) {
		const found = await search(words.slice(0, 200), 'all', 12).catch(() => null);
		const match = found?.find((block) => samePage(block.url, link.url));
		if (match) return match;
	}
	return link;
}
