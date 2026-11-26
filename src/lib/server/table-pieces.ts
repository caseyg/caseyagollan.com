import Defuddle from 'defuddle';
import { parseHTML } from 'linkedom';
import { piecesIn } from '$lib/table-pieces';
import type { Block } from '$lib/tables';
import { safePublicFetch } from './publishing/public-fetch';

const MAX_HTML = 3_000_000;
const TIMEOUT = 10_000;

/** Fetches another site's page, keeps its main text with defuddle, and takes it into paragraphs and pictures. */
/** Public HTTPS hosts only, each redirect checked, and no more than the page limit read. */
const publicPage = ((input: RequestInfo | URL, init?: RequestInit) => safePublicFetch(String(input instanceof Request ? input.url : input), init, fetch, MAX_HTML)) as typeof fetch;

export async function remotePagePieces(address: string, fetcher: typeof fetch = publicPage): Promise<Block[]> {
	const url = new URL(address);
	const response = await fetcher(url.href, {
		headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; caseyagollan.com tables)' },
		redirect: 'follow',
		signal: AbortSignal.timeout(TIMEOUT)
	});
	if (!response.ok || !/html/i.test(response.headers.get('content-type') ?? '')) return [];
	const html = (await response.text()).slice(0, MAX_HTML);
	return piecesFromHtml(html, response.url || url.href);
}

/** The pieces of a page's HTML, as defuddle reads its article. */
export function piecesFromHtml(html: string, address: string): Block[] {
	const { document } = parseHTML(html);
	const article = new Defuddle(document as unknown as Document, { url: address }).parse();
	const { document: body } = parseHTML(`<!doctype html><html><body><article>${article.content}</article></body></html>`);
	const root = body.querySelector('article');
	if (!root) return [];
	const url = new URL(address);
	url.hash = '';
	const title = (article.title || url.hostname.replace(/^www\./, '')).replace(/\s+/g, ' ').trim();
	return piecesIn(root as unknown as Element, root as unknown as Element, { path: url.href, origin: url.origin, title, local: false });
}
