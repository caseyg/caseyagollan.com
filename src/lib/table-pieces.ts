import { blockKey, type Block } from './tables';

/*
 * Pieces of a page to set out on a table on their own: its pictures, the social posts it shows,
 * and its paragraphs. This site's pages are read in the browser as the site renders them; other
 * sites' pages are read on the server, through defuddle, which keeps an article's main text.
 */

const MAX_PIECES = 80;
const MIN_PARAGRAPH = 40;
const MAX_EXCERPT = 600;

/** The site page a block's pieces come from, or null for books (drawn in the browser), links and other sites. */
export function piecesPath(block: Pick<Block, 'kind' | 'url'>, wikiHref: (url: string) => string | null = () => null): string | null {
	if (block.kind === 'wiki') return wikiHref(block.url);
	// A piece's pieces are its page's.
	if ((block.kind === 'post' || block.kind === 'image' || block.kind === 'quote') && block.url.startsWith('/') && !block.url.startsWith('/library')) return block.url.split('#')[0];
	return null;
}

/** The web page a link's pieces come from: links, Raindrop and Are.na blocks, and pieces taken from them. */
export function remotePiecesUrl(block: Pick<Block, 'kind' | 'url'>): string | null {
	if (!['link', 'raindrop', 'arena', 'image', 'quote'].includes(block.kind)) return null;
	try {
		const url = new URL(block.url);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		if (url.hostname === 'caseyagollan.com' || url.hostname === 'www.caseyagollan.com') return null;
		url.hash = '';
		return url.href;
	} catch {
		return null;
	}
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();

/** A link to a page that scrolls to and highlights a passage, by its first few words. */
export function passageUrl(path: string, text: string): string {
	const start = squash(text).split(' ').slice(0, 8).join(' ');
	return `${path}#:~:text=${encodeURIComponent(start).replace(/-/g, '%2D')}`;
}

/** A height that fits a quote's words at the width it is set out at. */
export function quoteSize(excerpt: string): { w: number; h: number } {
	const lines = Math.ceil(excerpt.length / 34);
	return { w: 300, h: Math.min(460, Math.max(140, 64 + lines * 25)) };
}

/** A picture's address as a block keeps it: this site's own pictures as site paths, others' whole. */
function pictureUrl(src: string, origin: string, local = true): string | undefined {
	try {
		const url = new URL(src, origin);
		if (local && url.origin === origin) return url.pathname + url.search;
		return url.protocol === 'https:' ? url.href : undefined;
	} catch {
		return undefined;
	}
}

const SOURCE_ICON: [RegExp, string][] = [
	[/bsky\.app|bsky\.social/, '🦋'],
	[/mastodon|social\.|\/@/, '🐘']
];

/** Reads the pieces out of a rendered page of this site. */
export function piecesFrom(document: Document, path: string, origin: string): Block[] {
	const title = squash(document.querySelector('h1')?.textContent) || squash(document.title.split(' - ')[0]) || path;
	const root = document.querySelector('.e-content, .wiki-body') ?? document.querySelector('article');
	const scope = root?.closest('article') ?? root;
	if (!root || !scope) return [];
	return piecesIn(root, scope, { path, origin, title });
}

/**
 * The pieces inside `root` (and social posts anywhere in `scope`). `path` is where a piece opens;
 * another site's pieces keep whole addresses (`local` false).
 */
export function piecesIn(root: Element, scope: Element, { path, origin, title, local = true }: { path: string; origin: string; title: string; local?: boolean }): Block[] {
	const from = `From ${title}`;
	const pieces: Block[] = [];
	const seen = new Set<string>();
	const add = (block: Block) => {
		const key = blockKey(block);
		if (seen.has(key) || pieces.length >= MAX_PIECES) return;
		seen.add(key);
		pieces.push(block);
	};

	for (const element of Array.from(scope.querySelectorAll<HTMLElement>('article.social-post, img, p, blockquote, li'))) {
		const card = element.closest('article.social-post');
		if (card && card !== element) continue;
		if (element.matches('article.social-post')) {
			const author = squash(element.querySelector('.name')?.textContent);
			const words = squash(element.querySelector('.body')?.textContent);
			const link = element.querySelector<HTMLAnchorElement>('a.time')?.getAttribute('href');
			if (!author || !words) continue;
			const url = link ? new URL(link, origin) : null;
			const href = url ? (url.origin === origin ? url.pathname + url.hash : url.href) : path;
			const handle = squash(element.querySelector('.handle')?.textContent);
			const icon = SOURCE_ICON.find(([pattern]) => pattern.test(url?.href ?? ''))?.[1] ?? '💬';
			const picture = element.querySelector<HTMLImageElement>('.body img');
			add({ kind: 'post', url: href, title: author, meta: handle || undefined, excerpt: words.slice(0, MAX_EXCERPT), image: picture ? pictureUrl(picture.getAttribute('src') ?? '', origin) : undefined, icon });
			continue;
		}
		if (!root.contains(element)) continue;
		if (element.matches('img')) {
			const image = pictureUrl(element.getAttribute('src') ?? '', origin, local);
			const size = Number(element.getAttribute('width')) || Infinity;
			if (!image || size < 48 || element.closest('.avatar')) continue;
			const caption = squash(element.closest('figure')?.querySelector('figcaption')?.textContent) || squash(element.getAttribute('alt'));
			add({ kind: 'image', url: caption ? passageUrl(path, caption) : path, title: caption || title, meta: caption ? from : undefined, image });
			continue;
		}
		// A list item holding a paragraph is read by that paragraph; a quotation's paragraphs stay together.
		if (element.matches('li') && element.querySelector('p')) continue;
		if (element.matches('p') && element.parentElement?.closest('blockquote')) continue;
		if (element.closest('figcaption')) continue;
		const words = squash(element.textContent);
		if (words.length < MIN_PARAGRAPH) continue;
		add({ kind: 'quote', url: passageUrl(path, words), title, excerpt: words.slice(0, MAX_EXCERPT) });
	}
	return pieces;
}

const cache = new Map<string, Promise<Block[]>>();

/**
 * The pieces of the page a block shows, or an empty list when it has none to take apart. `wikiHref`
 * finds a cag.wiki page's place in the wiki browser (from `$lib/wiki/links`).
 */
export function pagePieces(block: Pick<Block, 'kind' | 'url'>, wikiHref: (url: string) => string | null): Promise<Block[]> {
	const path = piecesPath(block, wikiHref);
	if (!path) return remotePieces(block);
	let found = cache.get(path);
	if (!found) {
		found = fetch(path, { credentials: 'same-origin', headers: { accept: 'text/html' } })
			.then((response) => (response.ok ? response.text() : ''))
			.then((html) => (html ? piecesFrom(new DOMParser().parseFromString(html, 'text/html'), path, location.origin) : []))
			.catch(() => []);
		found.then((pieces) => pieces.length || cache.delete(path));
		cache.set(path, found);
	}
	return found;
}

/** Another site's page, read on the server; empty when it can't be read. */
function remotePieces(block: Pick<Block, 'kind' | 'url'>): Promise<Block[]> {
	const url = remotePiecesUrl(block);
	if (!url) return Promise.resolve([]);
	let found = cache.get(url);
	if (!found) {
		found = fetch(`/api/tables/pieces?url=${encodeURIComponent(url)}`, { credentials: 'same-origin' })
			.then((response): Promise<{ pieces?: Block[] }> | object => (response.ok ? response.json() : {}))
			.then((data: { pieces?: Block[] }) => (Array.isArray(data.pieces) ? data.pieces : []))
			.catch(() => []);
		found.then((pieces) => pieces.length || cache.delete(url));
		cache.set(url, found);
	}
	return found;
}
