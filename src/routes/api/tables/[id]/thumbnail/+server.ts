import type { RequestHandler } from './$types';
import { readThumbnail } from '$lib/server/tables';

export const prerender = false;

/**
 * A table's picture, for the browse page's `<img>`. As an image an SVG runs nothing; opened on its
 * own, the sandboxing policy keeps it inert too. `?v=` changes with each save, so it can be cached.
 */
export const GET: RequestHandler = async ({ params, platform, url }) => {
	const svg = await readThumbnail(platform?.env?.PUBLISHING_STATE, params.id);
	if (!svg) return new Response('No picture yet.', { status: 404 });
	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml; charset=utf-8',
			'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; sandbox",
			'x-content-type-options': 'nosniff',
			'cache-control': url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache'
		}
	});
};
