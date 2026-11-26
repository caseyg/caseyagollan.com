import type { RequestHandler } from './$types';
import { connectionStatus, disconnect, startConnect } from '$lib/server/publishing/mastodon-oauth';
import { bindingCookie, oauthFor, PRIVATE } from '$lib/server/publishing/mastodon-oauth-routes';
import { randomToken } from '$lib/server/publishing/dpop';
import { DeliveryError } from '$lib/server/publishing/public-fetch';
import { ownerRequest } from '$lib/server/owner-request';
import { rateLimited } from '$lib/server/rate-limit';

export const prerender = false;

/** How Mastodon posting is connected. Owner only; never returns the token. */
export const GET: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await ownerRequest(request, env);
	if (session instanceof Response) return session;
	const client = oauthFor(env, request.url);
	if (!client) return Response.json({ configured: false }, { headers: PRIVATE });
	return Response.json({ configured: true, connection: await connectionStatus(client.oauth, client.tokenFallback) }, { headers: PRIVATE });
};

/** `{ action: 'connect' }` returns the instance's sign-in page to open; `{ action: 'disconnect' }` revokes and forgets the session. */
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	// Connecting makes the Worker call the instance, so it is rationed like other outbound fetches.
	const limited = await rateLimited(env?.FETCH_RATE_LIMITER, request, 'mastodon-oauth');
	if (limited) return limited;
	const session = await ownerRequest(request, env, { write: true });
	if (session instanceof Response) return session;
	const client = oauthFor(env, request.url);
	if (!client) return Response.json({ error: 'Mastodon OAuth is not set up on this site.' }, { status: 503, headers: PRIVATE });
	const body = await request.json().catch(() => ({})) as { action?: string };
	try {
		if (body.action === 'disconnect') {
			await disconnect(client.oauth);
			return Response.json({ configured: true, connection: await connectionStatus(client.oauth, client.tokenFallback) }, { headers: PRIVATE });
		}
		if (body.action !== 'connect') return Response.json({ error: 'Unknown action.' }, { status: 400, headers: PRIVATE });
		const binding = randomToken();
		const redirect = await startConnect(client.oauth, binding);
		return Response.json({ redirect }, { headers: { ...PRIVATE, 'set-cookie': bindingCookie(binding) } });
	} catch (cause) {
		if (cause instanceof DeliveryError) return Response.json({ error: cause.message }, { status: 502, headers: PRIVATE });
		throw cause;
	}
};
