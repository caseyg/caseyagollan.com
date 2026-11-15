import type { RequestHandler } from './$types';
import { searchRaindrop } from '$lib/server/raindrop';
import { editorSession } from '$lib/server/publishing/syndication-editor';
import { PRIVATE } from '$lib/server/tables-api';

export const prerender = false;

/** Casey's Raindrop bookmarks matching `?q=`, for the signed-in owner only: `{ blocks }`. */
export const GET: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return Response.json({ error: 'Sign in to search Raindrop bookmarks.' }, { status: 401, headers: PRIVATE });
	if (!env?.RAINDROP_TOKEN) return Response.json({ blocks: [] }, { headers: PRIVATE });
	try {
		const query = (url.searchParams.get('q') ?? '').slice(0, 200);
		const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 50);
		return Response.json({ blocks: await searchRaindrop(env.RAINDROP_TOKEN, query, limit) }, { headers: PRIVATE });
	} catch (error) {
		console.warn('Raindrop search failed', error);
		return Response.json({ error: 'Raindrop couldn’t be reached.' }, { status: 502, headers: PRIVATE });
	}
};
