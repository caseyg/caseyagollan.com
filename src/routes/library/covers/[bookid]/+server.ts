import type { RequestHandler } from './$types';
import { libraryMetadata } from '$lib/library-metadata';

export const GET: RequestHandler = async ({ params, platform, request }) => {
	if (!/^\d+$/.test(params.bookid)) return new Response('Not found', { status: 404 });
	const entry = libraryMetadata(Number(params.bookid));
	if (!entry.coverUrl || !entry.coverId) return new Response('Not found', { status: 404 });
	const bucket = platform?.env?.PUBLISHING_MEDIA;
	if (!bucket) {
		// Development also uses the saved R2 copy, never the upstream Covers API.
		return fetch(entry.coverUrl, { method: request.method, signal: request.signal });
	}
	const object = await bucket.get(`library/covers/openlibrary-${entry.coverId}-L.jpg`);
	if (!object) return new Response('Not found', { status: 404 });
	const headers = new Headers({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', ETag: object.httpEtag });
	if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers });
	return new Response(request.method === 'HEAD' ? null : object.body, { headers });
};
export const HEAD = GET;
