import type { RequestHandler } from './$types';
import { subscribe } from '$lib/server/buttondown';

export const prerender = false;

const PRIVATE = { 'Cache-Control': 'no-store' };

/**
 * Signs a reader up for the newsletter: `{ email }` as JSON from `SubscribeForm`, or a plain form
 * post without JavaScript, which comes back to the page it was sent from.
 */
export const POST: RequestHandler = async ({ request, url, platform }) => {
	const json = request.headers.get('content-type')?.includes('application/json');
	const fields = json ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : Object.fromEntries(await request.formData().catch(() => new FormData()));
	// A field people never see; bots that fill it are told they succeeded.
	const trap = typeof fields.website === 'string' && fields.website !== '';
	const email = typeof fields.email === 'string' ? fields.email.trim() : '';

	const referrer = request.headers.get('referer');
	const result = trap
		? ({ ok: true, status: 'subscribed' } as const)
		: await subscribe(platform?.env?.BUTTONDOWN_API_KEY, email, { ip: request.headers.get('cf-connecting-ip') });

	if (json) return Response.json(result, { status: result.ok ? 200 : result.status === 'invalid' ? 400 : result.status === 'unavailable' ? 503 : 502, headers: PRIVATE });

	const back = new URL(referrer && new URL(referrer).origin === url.origin ? referrer : '/posts', url.origin);
	back.searchParams.set('subscribe', result.status);
	return new Response(null, { status: 303, headers: { Location: `${back.pathname}${back.search}`, ...PRIVATE } });
};
