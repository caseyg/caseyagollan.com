import type { RequestHandler } from './$types';
import { clientMetadata } from '$lib/server/publishing/bluesky-oauth';
import { oauthFor } from '$lib/server/publishing/bluesky-oauth-routes';

export const prerender = false;

/** The atproto OAuth client metadata document; its URL is the client id. */
export const GET: RequestHandler = async ({ request, platform }) => {
	const client = oauthFor(platform?.env, request.url);
	if (!client) return new Response('Not found', { status: 404 });
	return Response.json(await clientMetadata(client.oauth), { headers: { 'cache-control': 'public, max-age=600', 'access-control-allow-origin': '*' } });
};
