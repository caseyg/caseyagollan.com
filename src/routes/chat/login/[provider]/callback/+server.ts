import type { RequestHandler } from './$types';
import { cookie, startVisitorSession } from '$lib/server/chat/identity';
import { finishLogin, LOGIN_COOKIE, LoginError } from '$lib/server/chat/login';

export const prerender = false;

/** Where the visitor's server sends them back: finish signing in and return to the chat. */
export const GET: RequestHandler = async ({ request, params, url, platform }) => {
	const env = platform?.env;
	const clear = `${LOGIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
	const headers = new Headers({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
	headers.append('set-cookie', clear);
	if (!env?.PUBLISHING_STATE) { headers.set('location', '/chat/?signin=' + encodeURIComponent('Signing in isn’t available here.')); return new Response(null, { status: 303, headers }); }
	try {
		const { author, returnTo } = await finishLogin({ bucket: env.PUBLISHING_STATE, origin: url.origin }, params.provider, url.searchParams, cookie(request, LOGIN_COOKIE));
		headers.append('set-cookie', await startVisitorSession(env, author));
		headers.set('location', returnTo);
	} catch (error) {
		const message = error instanceof LoginError ? error.message : 'Signing in didn’t finish. Try again.';
		if (!(error instanceof LoginError)) console.warn(JSON.stringify({ event: 'chat_login_failed', provider: params.provider }));
		headers.set('location', '/chat/?signin=' + encodeURIComponent(message));
	}
	return new Response(null, { status: 303, headers });
};
