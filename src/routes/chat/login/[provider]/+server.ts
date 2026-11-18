import type { RequestHandler } from './$types';
import { LOGIN_COOKIE, LoginError, safeReturn, startLogin } from '$lib/server/chat/login';

export const prerender = false;

const back = (to: string, error: string) => `${to}?signin=${encodeURIComponent(error)}`;

/** Start signing in: a form post with `address` (website, Mastodon instance or Bluesky handle). */
export const POST: RequestHandler = async ({ request, params, url, platform }) => {
	const form = await request.formData();
	const returnTo = safeReturn(form.get('return'));
	const bucket = platform?.env?.PUBLISHING_STATE;
	if (!bucket) return new Response(null, { status: 303, headers: { location: back(returnTo, 'Signing in isn’t available here.') } });
	try {
		const { location, binding } = await startLogin({ bucket, origin: url.origin }, params.provider, String(form.get('address') ?? ''), returnTo);
		return new Response(null, { status: 303, headers: { location, 'set-cookie': `${LOGIN_COOKIE}=${binding}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`, 'cache-control': 'no-store' } });
	} catch (error) {
		const message = error instanceof LoginError ? error.message : 'Signing in didn’t start. Try again.';
		if (!(error instanceof LoginError)) console.warn(JSON.stringify({ event: 'chat_login_start_failed', provider: params.provider }));
		return new Response(null, { status: 303, headers: { location: back(returnTo, message) } });
	}
};
