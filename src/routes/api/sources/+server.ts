import type { RequestHandler } from './$types';
import { ownerRequest } from '$lib/server/owner-request';
import { sourceBackend, sourceBlock, sourcesFor } from '$lib/server/sources/access';

export const prerender = false;

const PRIVATE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

/**
 * The site's own copy of Casey's Readwise, Raindrop and Are.na, for the signed-in owner only.
 * Everyone else gets 401 before the copy is touched; there is no public way in.
 *
 * `GET` answers where each source's sync stands; with `?q=` (and optionally `source`, `limit`)
 * it searches and answers `{ total, hits, blocks }`, the blocks being what a table would hold.
 */
export const GET: RequestHandler = async ({ request, url, platform }) => {
	const session = await ownerRequest(request, platform?.env);
	if (session instanceof Response) return session;
	const backend = sourceBackend(platform?.env);
	if (!backend) return Response.json({ available: false, sources: [] }, { headers: PRIVATE });
	const query = url.searchParams.get('q');
	if (query === null) return Response.json({ available: true, sources: await backend.status() }, { headers: PRIVATE });
	const sources = sourcesFor(backend, { owner: true })!;
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 60);
	const result = await sources.search({ query: query.slice(0, 200), source: url.searchParams.get('source') || undefined, limit });
	return Response.json({ total: result.total, hits: result.hits, blocks: result.hits.map(sourceBlock) }, { headers: PRIVATE });
};

/** Starts a sync now, wherever this is (a branch preview only syncs when asked). Answers where each source stands. */
export const POST: RequestHandler = async ({ request, platform }) => {
	const session = await ownerRequest(request, platform?.env, { write: true });
	if (session instanceof Response) return session;
	const backend = sourceBackend(platform?.env);
	if (!backend) return Response.json({ error: 'The source cache isn’t set up here.' }, { status: 503, headers: PRIVATE });
	const wait = (platform as { ctx?: ExecutionContext } | undefined)?.ctx;
	const sync = backend.tick({ force: true }).catch(() => []);
	wait?.waitUntil(sync);
	// A first sync takes minutes; this answers once the first round is in, or after a few seconds.
	await Promise.race([sync, new Promise((resolve) => setTimeout(resolve, 5000))]);
	return Response.json({ available: true, sources: await backend.status() }, { headers: PRIVATE });
};
