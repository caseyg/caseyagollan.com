/**
 * Owner sign-in on branch previews. A preview has no passkeys (they are bound to the
 * production hostname), so it signs Casey in as an ordinary IndieAuth client of the
 * production site: `/auth/preview` sends the browser to production's authorization
 * endpoint, Casey approves there with a passkey, and `/auth/preview/callback` redeems
 * the code (PKCE, identity only, no token is kept) and checks that production vouched
 * for `me` before starting the preview's own owner session.
 *
 * The client_id is the preview's own origin and the callback is on it, so production
 * accepts it without fetching client metadata.
 */
import { safeReturnTo } from '../../return-to';
import type { AuthRPC, AuthSettings } from './contracts';

export const PREVIEW_STATE_COOKIE = '__Host-indieauth-preview';
const SESSION_COOKIE = '__Host-indieauth-session';
const STATE_TTL_SECONDS = 600;
export type PreviewFetcher = (input: string, init: RequestInit) => Promise<Response>;

function base64url(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
async function challengeFor(verifier: string) {
	return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}
function cookie(request: Request, name: string) {
	return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
function redirect(location: string, cookies: string[] = []) {
	const headers = new Headers({ location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
	for (const value of cookies) headers.append('set-cookie', value);
	return new Response(null, { status: 303, headers });
}
const clearState = `${PREVIEW_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const failed = (origin: string) => redirect(`${origin}/account?signin=failed`, [clearState]);

/** The client this preview presents to the issuer. */
export function previewClient(origin: string) {
	return { clientId: `${origin}/`, redirectUri: `${origin}/auth/preview/callback` };
}

/** GET /auth/preview?returnTo=/chat: start signing in on the issuer. */
export async function startPreviewSignIn(request: Request, settings: AuthSettings): Promise<Response> {
	const url = new URL(request.url);
	const issuer = settings.previewIssuer!;
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'), url.origin) ?? '/account';
	const state = random(), verifier = random();
	const { clientId, redirectUri } = previewClient(url.origin);
	const target = new URL('auth', issuer);
	for (const [key, value] of Object.entries({
		response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
		code_challenge: await challengeFor(verifier), code_challenge_method: 'S256', me: settings.me
	})) target.searchParams.set(key, value);
	const value = [state, verifier, base64url(new TextEncoder().encode(returnTo))].join('.');
	return redirect(target.href, [`${PREVIEW_STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`]);
}

/** GET /auth/preview/callback?code&state&iss: finish signing in. */
export async function finishPreviewSignIn(request: Request, settings: AuthSettings, store: AuthRPC, fetcher: PreviewFetcher = (input, init) => fetch(input, init)): Promise<Response> {
	const url = new URL(request.url);
	const issuer = settings.previewIssuer!;
	const [state, verifier, encodedReturn] = cookie(request, PREVIEW_STATE_COOKIE)?.split('.') ?? [];
	const code = url.searchParams.get('code');
	if (!state || !verifier || !code || url.searchParams.get('state') !== state || url.searchParams.get('iss') !== issuer) return failed(url.origin);
	let returnTo = '/account';
	try { returnTo = safeReturnTo(new TextDecoder().decode(Uint8Array.from(atob(encodedReturn.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))), url.origin) ?? returnTo; } catch { /* Fall back to the account page. */ }
	const { clientId, redirectUri } = previewClient(url.origin);
	let me: unknown;
	try {
		// Identity-only redemption at the authorization endpoint: the issuer revokes the token it mints.
		const response = await fetcher(new URL('auth', issuer).href, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
			body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }).toString()
		});
		if (!response.ok) return failed(url.origin);
		me = ((await response.json()) as { me?: unknown }).me;
	} catch { return failed(url.origin); }
	if (me !== settings.me) return failed(url.origin);
	const session = await store.invoke('previewSession', { me });
	const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
	// The account page records the owner hint for static pages, then forwards to returnTo.
	return redirect(`${url.origin}/account?returnTo=${encodeURIComponent(returnTo)}`, [
		clearState,
		`${SESSION_COOKIE}=${session.sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
	]);
}
