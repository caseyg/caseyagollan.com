import type { RequestHandler } from './$types';
import { privateArena, privateBlock, searchArena } from '$lib/server/arena';
import { editorSession } from '$lib/server/publishing/syndication-editor';
import { PRIVATE } from '$lib/server/tables-api';

export const prerender = false;

/** Casey's private Are.na matching `?q=`, for the signed-in owner only: `{ blocks }`. */
export const GET: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return Response.json({ error: 'Sign in to search private Are.na blocks.' }, { status: 401, headers: PRIVATE });
	if (!env?.ARENA_PAT) return Response.json({ blocks: [] }, { headers: PRIVATE });
	try {
		const documents = await privateArena(env, (promise) => (platform as { ctx?: ExecutionContext } | undefined)?.ctx?.waitUntil(promise));
		const query = (url.searchParams.get('q') ?? '').slice(0, 200);
		const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 60);
		return Response.json({ blocks: searchArena(documents, query, limit).map(privateBlock) }, { headers: PRIVATE });
	} catch (error) {
		console.warn('Are.na private search failed', error);
		return Response.json({ error: 'Are.na couldn’t be reached.' }, { status: 502, headers: PRIVATE });
	}
};
