import type { RequestHandler } from './$types';
import { ownerRequest } from '$lib/server/owner-request';
import { sourceBackend, sourceBlock, sourcesFor } from '$lib/server/sources/access';
import type { SourceHit } from '$lib/server/sources/index';
import { isFeedSource, type FeedItem } from '$lib/table-feed';

export const prerender = false;

const PRIVATE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

/**
 * The site's own copy of Casey's Readwise, Raindrop and Are.na, for the signed-in owner only.
 * Everyone else gets 401 before the copy is touched; there is no public way in.
 *
 * `GET` answers where each source's sync stands; with `?q=` (and optionally `source`, `limit`)
 * it searches and answers `{ total, hits, blocks }`, the blocks being what a table would hold.
 * With `?since=` (an ISO time; optionally `until`, `offset`) it lists what was saved in that time,
 * newest first, as `{ total, items }` for the tables Add menu's feed. What is like the things
 * selected on a table is asked of `/api/sources/alike`. With `?pictures` it answers how far reading
 * the words in stored pictures has got (`PictureReading`).
 *
 * `POST` starts a sync; with a JSON body `{ read: <count> }` it instead has the words read in that
 * many more stored pictures (0 stops), which is never done in bulk unasked.
 */
const feedItem = (hit: SourceHit): FeedItem | null => (isFeedSource(hit.source) && hit.saved ? { block: sourceBlock(hit), at: hit.saved, source: hit.source } : null);
const isoTime = (value: string | null) => (value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined);

export const GET: RequestHandler = async ({ request, url, platform }) => {
	const session = await ownerRequest(request, platform?.env);
	if (session instanceof Response) return session;
	const backend = sourceBackend(platform?.env);
	if (!backend) return Response.json({ available: false, sources: [] }, { headers: PRIVATE });
	const query = url.searchParams.get('q');
	const since = isoTime(url.searchParams.get('since'));
	if (since) {
		const sources = sourcesFor(backend, { owner: true })!;
		const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 100);
		const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
		const result = await sources.search({ since, until: isoTime(url.searchParams.get('until')), source: url.searchParams.get('source') || undefined, limit, offset });
		return Response.json({ total: result.total, items: result.hits.map(feedItem).filter((item) => item !== null) }, { headers: PRIVATE });
	}
	if (url.searchParams.has('pictures')) return Response.json({ available: true, pictures: await backend.pictures() }, { headers: PRIVATE });
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
	const asked = request.headers.get('content-type')?.includes('json') ? ((await request.json().catch(() => null)) as { read?: unknown } | null) : null;
	if (typeof asked?.read === 'number' && Number.isFinite(asked.read)) {
		return Response.json({ available: true, pictures: await backend.readPictures(Math.min(Math.max(Math.floor(asked.read), 0), 100_000)) }, { headers: PRIVATE });
	}
	const wait = (platform as { ctx?: ExecutionContext } | undefined)?.ctx;
	const sync = backend.tick({ force: true }).catch(() => []);
	wait?.waitUntil(sync);
	// A first sync takes minutes; this answers once the first round is in, or after a few seconds.
	await Promise.race([sync, new Promise((resolve) => setTimeout(resolve, 5000))]);
	return Response.json({ available: true, sources: await backend.status() }, { headers: PRIVATE });
};
