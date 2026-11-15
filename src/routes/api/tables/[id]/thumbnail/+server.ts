import type { RequestHandler } from './$types';
import { readTable } from '$lib/server/tables';
import { isOwner } from '$lib/server/tables-api';
import { isPublished } from '$lib/tables';
import { tableWireframe } from '$lib/table-wireframe';

export const prerender = false;

/**
 * A table's picture for the browse page's `<img>`: its layout as plain boxes and curves, drawn from
 * the saved canvas on each request. It holds no text or images, and a sandboxing policy keeps it
 * inert when opened on its own. `?v=` is the table's last change, so a versioned picture is cached.
 */
export const GET: RequestHandler = async ({ params, platform, url, request }) => {
	const table = await readTable(platform?.env?.PUBLISHING_STATE, params.id);
	// A draft's picture is the owner's alone, like the draft.
	const draft = !!table && !isPublished(table);
	if (!table || (draft && !(await isOwner(request, platform?.env)))) return new Response('No such table.', { status: 404 });
	const svg = tableWireframe(table.document);
	if (!svg) return new Response('Nothing on this table yet.', { status: 404 });
	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml; charset=utf-8',
			'content-security-policy': "default-src 'none'; sandbox",
			'x-content-type-options': 'nosniff',
			'cache-control': draft ? 'private, no-store' : url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache'
		}
	});
};
