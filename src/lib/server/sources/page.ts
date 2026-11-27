/**
 * Reads the page a thin link leads to, for the cache: its main text as Markdown (defuddle, as the
 * chat's `fetch_page` does), what it links to, and the picture it names for sharing. Only public
 * https addresses, through `safePublicFetch`, with a size limit and a timeout.
 */
import Defuddle from 'defuddle';
import { parseHTML } from 'linkedom';
import { readableMarkdown } from '../chat/fetch-page';
import { safePublicFetch, type PublicFetcher } from '../publishing/public-fetch';
import { linksIn } from './plugins/http';
import type { PageText } from './sync';

const PAGE_BYTES = 3_000_000;

export async function readPageText(address: string, fetcher?: PublicFetcher): Promise<PageText | null> {
	if (!/^https:\/\//i.test(address)) return null;
	const headers = { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; caseyagollan.com; +https://caseyagollan.com/)' };
	const response = await (fetcher ?? ((target, init) => safePublicFetch(target, init, fetch, PAGE_BYTES)))(address, { headers, redirect: 'follow', signal: AbortSignal.timeout(12_000) });
	if (!response.ok || !/html|xml/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); return null; }
	const base = response.url || address;
	const { document } = parseHTML(await response.text());
	const meta = (name: string) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim() || undefined;
	const article = new Defuddle(document as unknown as Document, { url: base }).parse();
	const text = readableMarkdown(article.content, base);
	let image: string | undefined;
	try { const shared = meta('og:image') ?? meta('twitter:image'); image = shared ? new URL(shared, base).href : undefined; } catch { image = undefined; }
	return { text, links: linksIn(text), ...(image?.startsWith('https:') ? { image } : {}) };
}
