import type { RequestHandler } from './$types';
import { finishConnect } from '$lib/server/publishing/mastodon-oauth';
import { bindingCookie, oauthFor, PRIVATE, readBinding } from '$lib/server/publishing/mastodon-oauth-routes';
import { editorSession } from '$lib/server/publishing/syndication-editor';
import { DeliveryError } from '$lib/server/publishing/public-fetch';
import { rateLimited } from '$lib/server/rate-limit';

export const prerender = false;

/** Where the instance sends the owner back. Finishes the sign-in, then returns to /account. */
export const GET: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	const client = oauthFor(env, request.url);
	if (!client) return new Response('Not found', { status: 404, headers: PRIVATE });
	const limited = await rateLimited(env?.FETCH_RATE_LIMITER, request, 'mastodon-oauth');
	if (limited) return limited;
	const back = (result: Record<string, string>) => {
		const target = new URL('/account', url.origin);
		for (const [key, value] of Object.entries(result)) target.searchParams.set(key, value);
		target.hash = 'mastodon';
		return new Response(null, { status: 303, headers: { ...PRIVATE, location: target.href, 'set-cookie': bindingCookie('', 0), 'referrer-policy': 'no-referrer' } });
	};
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return back({ mastodon: 'error', message: 'Sign in, then connect Mastodon again.' });
	try {
		await finishConnect(client.oauth, url.searchParams, readBinding(request));
		return back({ mastodon: 'connected' });
	} catch (cause) {
		const known = cause instanceof DeliveryError;
		if (!known) console.error('mastodon_oauth_callback_failed', cause);
		return back({ mastodon: 'error', message: known ? cause.message.slice(0, 200) : 'Mastodon could not be connected.' });
	}
};
