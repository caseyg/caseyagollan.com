import type { RequestHandler } from './$types';
import { finishConnect, OAuthUnavailable } from '$lib/server/publishing/bluesky-oauth';
import { bindingCookie, oauthFor, PRIVATE, readBinding } from '$lib/server/publishing/bluesky-oauth-routes';
import { editorSession } from '$lib/server/publishing/syndication-editor';
import { DeliveryError } from '$lib/server/publishing/public-fetch';

export const prerender = false;

/** Where Bluesky sends the owner back. Finishes the sign-in, then returns to /account. */
export const GET: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	const client = oauthFor(env, request.url);
	if (!client) return new Response('Not found', { status: 404, headers: PRIVATE });
	const back = (result: Record<string, string>) => {
		const target = new URL('/account', url.origin);
		for (const [key, value] of Object.entries(result)) target.searchParams.set(key, value);
		target.hash = 'bluesky';
		return new Response(null, { status: 303, headers: { ...PRIVATE, location: target.href, 'set-cookie': bindingCookie('', 0), 'referrer-policy': 'no-referrer' } });
	};
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return back({ bluesky: 'error', message: 'Sign in, then connect Bluesky again.' });
	try {
		await finishConnect(client.oauth, url.searchParams, readBinding(request));
		return back({ bluesky: 'connected' });
	} catch (cause) {
		const known = cause instanceof DeliveryError || cause instanceof OAuthUnavailable;
		if (!known) console.error('bluesky_oauth_callback_failed', cause);
		return back({ bluesky: 'error', message: known ? cause.message.slice(0, 200) : 'Bluesky could not be connected.' });
	}
};
