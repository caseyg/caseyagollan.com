import type { RequestHandler } from './$types';
import { remotePiecesUrl } from '$lib/table-pieces';
import { isOwner } from '$lib/server/tables-api';
import { remotePagePieces } from '$lib/server/table-pieces';

export const prerender = false;

/**
 * Another site's paragraphs and pictures, for the Add menu when a link is selected:
 * `?url=https://…`. In production only the signed-in owner may ask, so the site doesn't
 * fetch pages for anyone; previews allow the `?owner=demo` table, as they do everything else.
 */
export const GET: RequestHandler = async ({ url, request, platform }) => {
	const address = remotePiecesUrl({ kind: 'link', url: url.searchParams.get('url') ?? '' });
	if (!address) return Response.json({ error: 'That isn’t a web address.' }, { status: 400 });
	// Production is every host this Worker answers on that isn't a branch preview or a local run, its workers.dev address included.
	const elsewhere = !!platform?.env?.AUTH_PREVIEW_ISSUER || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (!elsewhere && !(await isOwner(request, platform?.env))) return Response.json({ error: 'Only the owner can do that.' }, { status: 403 });
	try {
		const pieces = await remotePagePieces(address);
		return Response.json({ pieces }, { headers: { 'cache-control': 'private, max-age=600' } });
	} catch (error) {
		console.error('Table pieces fetch failed:', address, error);
		return Response.json({ pieces: [], error: 'That page couldn’t be read.' }, { status: 502 });
	}
};
