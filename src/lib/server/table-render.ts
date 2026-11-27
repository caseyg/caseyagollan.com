/**
 * What the chat's `table_render` keeps and checks on the server: the pictures of a PDF's pages
 * (drawn by pdf.js on Casey's table page, since a Worker has no canvas to draw on, and kept in R2
 * so a page is drawn once), and whether an address is a PDF or a web page.
 */
import { addressHash } from './screenshot';
import { publicUrl, safePublicStream } from './publishing/public-fetch';
import { MAX_PDF_BYTES, MAX_PDF_PAGE, pdfPageSrc, type RenderedPage } from '../table-render';

export { MAX_PDF_BYTES };
/** The most one page's picture may weigh. */
export const MAX_PAGE_BYTES = 2_000_000;

export const pdfPageKey = async (address: string, page: number) => `renders/pdf/${await addressHash(address)}/${page}.jpg`;

/** A public https address as it is kept, or null: the only kind fetched or captured for a table. */
export function renderAddress(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 2000) return null;
	try { return publicUrl(value.trim()).href; } catch { return null; }
}

export const pageNumber = (value: unknown): number | null => {
	const page = Number(value);
	return Number.isInteger(page) && page >= 1 && page <= MAX_PDF_PAGE ? page : null;
};

/** A page's picture already kept: where it is served, its size, and how many pages its PDF has. */
export async function keptPdfPage(bucket: R2Bucket | undefined, address: string, page: number): Promise<RenderedPage | null> {
	const found = await bucket?.head(await pdfPageKey(address, page)).catch(() => null);
	const w = Number(found?.customMetadata?.width), h = Number(found?.customMetadata?.height), pages = Number(found?.customMetadata?.pages);
	return found && w > 0 && h > 0 ? { page, src: pdfPageSrc(address, page), w, h, pages: pages > 0 ? pages : page } : null;
}

/** Keeps one page's picture. The bytes must be a JPEG no larger than `MAX_PAGE_BYTES`. */
export async function keepPdfPage(bucket: R2Bucket, address: string, page: number, image: ArrayBuffer, size: { w: number; h: number; pages: number }): Promise<RenderedPage> {
	const bytes = new Uint8Array(image);
	if (bytes.length > MAX_PAGE_BYTES) throw new RangeError('That picture is too large.');
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new TypeError('A page’s picture must be a JPEG.');
	await bucket.put(await pdfPageKey(address, page), image, {
		httpMetadata: { contentType: 'image/jpeg' },
		customMetadata: { url: address.slice(0, 1000), width: String(size.w), height: String(size.h), pages: String(size.pages), renderedAt: new Date().toISOString() }
	});
	return { page, src: pdfPageSrc(address, page), ...size };
}

const PDF_NAME = /\.pdf$/i;

/**
 * Whether an address serves a PDF or a web page. A name ending `.pdf` settles it; otherwise the
 * address is asked what it sends (arXiv's `/pdf/1706.03762` has no ending). Anything unclear is a page.
 */
export async function renderKind(address: string, fetcher: typeof fetch = fetch): Promise<'pdf' | 'page'> {
	let url: URL;
	try { url = new URL(address); } catch { return 'page'; }
	if (PDF_NAME.test(url.pathname)) return 'pdf';
	try {
		const response = await safePublicStream(address, { headers: { accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5', range: 'bytes=0-1023' }, signal: AbortSignal.timeout(8000) }, fetcher, MAX_PDF_BYTES);
		const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
		await response.body?.cancel().catch(() => {});
		return type === 'application/pdf' ? 'pdf' : 'page';
	} catch {
		return 'page';
	}
}
