import type { RequestHandler } from './$types';
import { blueskyClientMetadata } from '$lib/server/chat/login';

export const prerender = false;

/** atproto OAuth client metadata for chat sign-in with Bluesky: identity only. */
export const GET: RequestHandler = async ({ url, platform }) => {
	const bucket = platform?.env?.PUBLISHING_STATE;
	if (!bucket) return new Response('Not configured', { status: 503 });
	return Response.json(await blueskyClientMetadata(bucket, url.origin), { headers: { 'cache-control': 'public, max-age=600', 'access-control-allow-origin': '*' } });
};
