import type { RequestHandler } from './$types';
import { ownerRequest } from '$lib/server/owner-request';
import { sourceBackend, sourceBlock, sourcesFor } from '$lib/server/sources/access';
import { LIKE_SEEDS_MAX, LIKE_WORDS_MAX, type LikeSeed } from '$lib/table-feed';

export const prerender = false;

const PRIVATE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/**
 * What in the site's own copy of Casey's saves is like the things selected on a table, for the
 * signed-in owner only; everyone else gets 401 before the copy is touched. A `POST` because a
 * sticky's words don't fit an address, though it changes nothing but the words read from pictures.
 *
 * Takes `{ seeds: [{ url?, words?, picture? }], limit? }`: a block by its address (and its picture's
 * when it is a picture), a sticky or text box by its words. Answers `{ blocks }`, what is near
 * more of them first. A picture's words are read by a vision model the first time and kept.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const session = await ownerRequest(request, platform?.env);
	if (session instanceof Response) return session;
	const sources = sourcesFor(sourceBackend(platform?.env), { owner: true });
	if (!sources) return Response.json({ blocks: [] }, { headers: PRIVATE });
	const body = (await request.json().catch(() => null)) as { seeds?: unknown; limit?: unknown } | null;
	const seeds: LikeSeed[] = (Array.isArray(body?.seeds) ? body.seeds : [])
		.slice(0, LIKE_SEEDS_MAX)
		.map((seed: Record<string, unknown> | null) => ({ url: text(seed?.url, 2000), words: text(seed?.words, LIKE_WORDS_MAX), picture: text(seed?.picture, 2000) }))
		.filter((seed: LikeSeed) => seed.url || seed.words || seed.picture);
	if (!seeds.length) return Response.json({ blocks: [] }, { headers: PRIVATE });
	const limit = Math.min(Math.max(Number(body?.limit) || 24, 1), 50);
	const hits = await sources.alike({ seeds, limit }).catch(() => []);
	return Response.json({ blocks: hits.map(sourceBlock) }, { headers: PRIVATE });
};
