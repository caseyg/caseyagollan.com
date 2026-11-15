import type { RequestHandler } from './$types';
import { readTable, readThumbnail } from '$lib/server/tables';
import { isOwner } from '$lib/server/tables-api';
import { isPublished } from '$lib/tables';

export const prerender = false;

/**
 * A table's picture, for the browse page's `<img>`. As an image an SVG runs nothing; opened on its
 * own, the sandboxing policy keeps it inert too. `?v=` changes with each save, so it can be cached.
 */
export const GET: RequestHandler = async ({ params, platform, url, request }) => {
	const bucket = platform?.env?.PUBLISHING_STATE;
	const table = await readTable(bucket, params.id);
	// A draft's picture is the owner's alone, like the draft.
	const draft = !!table && !isPublished(table);
	if (!table || (draft && !(await isOwner(request, platform?.env)))) return new Response('No picture yet.', { status: 404 });
	const svg = await readThumbnail(bucket, params.id);
	if (!svg) return new Response('No picture yet.', { status: 404 });
	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml; charset=utf-8',
			'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; sandbox",
			'x-content-type-options': 'nosniff',
			'cache-control': draft ? 'private, no-store' : url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache'
		}
	});
};
