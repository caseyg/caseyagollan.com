import type { RequestHandler } from './$types';

/**
 * The site's own pictures (book covers and media on files.caseyagollan.com), served from this
 * origin so a table's canvas can draw them into its picture. That host sends no CORS headers,
 * and a canvas can't read a picture from another origin without them. Nothing else is fetched.
 */
const HOST = 'files.caseyagollan.com';
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

export const GET: RequestHandler = async ({ url, fetch }) => {
	let source: URL;
	try {
		source = new URL(url.searchParams.get('src') ?? '');
	} catch {
		return new Response('Not found', { status: 404 });
	}
	if (source.protocol !== 'https:' || source.hostname !== HOST || source.username || source.port) return new Response('Not found', { status: 404 });
	const upstream = await fetch(source.href).catch(() => null);
	const type = upstream?.headers.get('content-type')?.split(';')[0].trim() ?? '';
	if (!upstream?.ok || !TYPES.has(type)) return new Response('Not found', { status: 404 });
	return new Response(upstream.body, {
		headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }
	});
};
