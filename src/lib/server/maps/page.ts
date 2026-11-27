/**
 * Reading a page for a map: its main text as Markdown (defuddle, as `fetch_page` does), what it
 * links to, and the pictures it offers for a card (the one it names for sharing, then the first
 * in its text). Used for documents a source gave too little of: a bookmark with a line of
 * excerpt, a Reader export that is all boilerplate.
 */
import Defuddle from 'defuddle';
import { parseHTML } from 'linkedom';
import { readableMarkdown } from '../chat/fetch-page';
import { safePublicFetch, type PublicFetcher } from '../publishing/public-fetch';
import { linksIn } from './text';

export interface ReadPage { url: string; title: string; site?: string; author?: string; text: string; links: string[]; images: string[] }

export const TEXT_MAX = 30_000;
const PAGE_BYTES = 3_000_000;

/** Pictures in a Markdown text that could lead a card: not icons, trackers, avatars or vector art. */
export function picturesIn(markdown: string): string[] {
	const found: string[] = [];
	for (const match of markdown.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g)) {
		const src = match[1];
		if (/\.(svg|gif|ico)(\?|$)|\/(avatar|icon|logo|emoji|badge|pixel|spacer|sprite)s?[\/._-]|gravatar|1x1|data:/i.test(src)) continue;
		if (!found.includes(src)) found.push(src);
	}
	return found.slice(0, 4);
}

/** A video's own still, for the services that publish one at a known address. */
export function videoStill(url: string): string | undefined {
	const youtube = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url)?.[1];
	return youtube ? `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg` : undefined;
}

export async function readPage(address: string, options: { origin: string; assets?: Pick<Fetcher, 'fetch'>; fetcher?: PublicFetcher } ): Promise<ReadPage> {
	const url = new URL(address, options.origin);
	url.hash = '';
	const own = url.origin === new URL(options.origin).origin || url.hostname === 'caseyagollan.com';
	const headers = { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; caseyagollan.com chat; +https://caseyagollan.com/chat/)' };
	const response = own && options.assets
		? await options.assets.fetch(new Request(new URL(url.pathname + url.search, options.origin), { headers }))
		: await (options.fetcher ?? ((target, init) => safePublicFetch(target, init, fetch, PAGE_BYTES)))(url.href, { headers, redirect: 'follow', signal: AbortSignal.timeout(9000) });
	if (!response.ok) { await response.body?.cancel(); throw new Error(`${url.host} answered ${response.status}.`); }
	if (!/html|xml/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); throw new Error(`${url.host} didn’t send a page.`); }
	const body = await response.text();
	const base = response.url || url.href;
	const { document } = parseHTML(body);
	const meta = (name: string) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim() || undefined;
	const article = new Defuddle(document as unknown as Document, { url: base }).parse();
	const text = readableMarkdown(article.content, base);
	const absolute = (value: string | undefined) => { try { return value ? new URL(value, base).href : undefined; } catch { return undefined; } };
	const shared = [meta('og:image'), meta('og:image:secure_url'), meta('twitter:image'), meta('twitter:image:src'), article.image].map(absolute).filter((src): src is string => !!src && src.startsWith('https:'));
	return {
		url: base,
		title: (article.title || meta('og:title') || url.host).replace(/\s+/g, ' ').trim(),
		site: article.site || meta('og:site_name'),
		author: article.author || undefined,
		text: text.slice(0, TEXT_MAX),
		links: [...new Set(linksIn(text))].slice(0, 400),
		images: [...new Set([...shared, ...picturesIn(text)])].slice(0, 5)
	};
}
