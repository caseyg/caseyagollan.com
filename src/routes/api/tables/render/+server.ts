import type { RequestHandler } from './$types';
import { isOwner, ownerBucket, PRIVATE } from '$lib/server/tables-api';
import { safePublicStream } from '$lib/server/publishing/public-fetch';
import { PICTURE_HASH, pictureKey } from '$lib/server/maps/images';
import { keepPdfPage, keptPdfPage, MAX_PAGE_BYTES, MAX_PDF_BYTES, pageNumber, pdfPageKey, renderAddress } from '$lib/server/table-render';

export const prerender = false;

const refuse = (error: string, status: number) => Response.json({ error }, { status, headers: PRIVATE });

/**
 * The pages of a PDF as pictures, for tables (`table_render`, `$lib/table-render`):
 * - `?picture=<hash>` is a picture mirrored for a map's card.
 * - `?pdf=<address>&page=3` is the picture of page 3 once it has been kept, for anyone (a table is
 *   public); `&info` answers with its size and the PDF's page count instead of the picture.
 * - `?pdf=<address>` alone hands Casey's table page the PDF itself, to draw with pdf.js: other
 *   sites rarely allow a browser to read their files. Only public https addresses are fetched, and
 *   on caseyagollan.com only for the signed-in owner; previews allow the `?owner=demo` table.
 */
export const GET: RequestHandler = async ({ url, request, platform }) => {
	// A map's mirrored picture (`table_map`, `$lib/server/maps/images`), by the hash it was kept under: for anyone, like the table it is on.
	const picture = url.searchParams.get('picture');
	if (picture !== null) {
		const stored = PICTURE_HASH.test(picture) ? await platform?.env?.SCREENSHOTS?.get(pictureKey(picture)) : null;
		// One the look-over hasn't cleared (a person, or never checked) is not served, whatever a table says.
		if (!stored || stored.customMetadata?.people !== 'ok') return refuse('No such picture.', 404);
		return new Response(stored.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=2592000, immutable', 'x-content-type-options': 'nosniff' } });
	}
	const address = renderAddress(url.searchParams.get('pdf'));
	if (!address) return refuse('That isn’t a public https address.', 400);
	const bucket = platform?.env?.SCREENSHOTS;

	if (url.searchParams.has('page')) {
		const page = pageNumber(url.searchParams.get('page'));
		if (!page) return refuse('No such page.', 400);
		if (url.searchParams.has('info')) {
			const kept = await keptPdfPage(bucket, address, page);
			return kept ? Response.json(kept, { headers: { 'cache-control': 'private, max-age=60' } }) : refuse('That page hasn’t been drawn yet.', 404);
		}
		const stored = await bucket?.get(await pdfPageKey(address, page));
		if (!stored) return refuse('That page hasn’t been drawn yet.', 404);
		return new Response(stored.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=604800', 'x-content-type-options': 'nosniff' } });
	}

	if (url.hostname === 'caseyagollan.com' && !(await isOwner(request, platform?.env))) return refuse('Only the owner can do that.', 403);
	try {
		const response = await safePublicStream(address, { headers: { accept: 'application/pdf,*/*;q=0.5' }, signal: request.signal }, fetch, MAX_PDF_BYTES);
		if (!response.ok) { await response.body?.cancel(); return refuse(`${new URL(address).host} answered ${response.status}.`, 502); }
		// Always handed over as a PDF to save, whatever it is, so nothing fetched here is ever a page of this site.
		return new Response(response.body, {
			headers: {
				'content-type': 'application/pdf', 'content-length': response.headers.get('content-length')!, 'content-disposition': 'attachment; filename="document.pdf"',
				'content-security-policy': "default-src 'none'; sandbox", 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=600'
			}
		});
	} catch (error) {
		const message = String((error as Error)?.message ?? error);
		console.error('Table render PDF fetch failed:', address, message);
		return refuse(/exceeds body limit/.test(message) ? `That PDF is larger than ${Math.round(MAX_PDF_BYTES / 1_000_000)} MB.` : 'That PDF couldn’t be fetched.', 502);
	}
};

/** Keeps one page's picture, drawn on Casey's table page: `?pdf=<address>&page=3&w=1236&h=1600&pages=15`, a JPEG body. Owner only. */
export const PUT: RequestHandler = async ({ url, request, platform }) => {
	const allowed = await ownerBucket(request, platform?.env);
	if (allowed instanceof Response) return allowed;
	const bucket = platform?.env?.SCREENSHOTS;
	if (!bucket) return refuse('Pictures can’t be kept here.', 503);
	const address = renderAddress(url.searchParams.get('pdf'));
	const page = pageNumber(url.searchParams.get('page'));
	const w = Math.round(Number(url.searchParams.get('w'))), h = Math.round(Number(url.searchParams.get('h'))), pages = pageNumber(url.searchParams.get('pages'));
	if (!address || !page || !pages || page > pages || !(w > 0 && w <= 8000) || !(h > 0 && h <= 8000)) return refuse('Say which page of which PDF, and its size.', 400);
	if (Number(request.headers.get('content-length')) > MAX_PAGE_BYTES) return refuse('That picture is too large.', 413);
	try {
		return Response.json(await keepPdfPage(bucket, address, page, await request.arrayBuffer(), { w, h, pages }), { headers: PRIVATE });
	} catch (error) {
		if (error instanceof RangeError) return refuse(error.message, 413);
		if (error instanceof TypeError) return refuse(error.message, 415);
		throw error;
	}
};
