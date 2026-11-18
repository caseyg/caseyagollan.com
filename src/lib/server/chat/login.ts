/**
 * Visitor sign-in for /chat. Three ways, all ending in a chat-only session
 * (`startVisitorSession`); none of them keeps the visitor's tokens.
 *
 * - Your website: IndieAuth as a client (https://indieauth.spec.indieweb.org/), profile
 *   scope only, with PKCE. The client id is `/chat/client.json`, a client metadata document.
 * - Mastodon: the instance's OAuth with `read:accounts`, an app registered once per
 *   instance and site origin, then the token is revoked once the profile is read.
 * - Bluesky: atproto OAuth with the bare `atproto` scope, reusing the site's confidential
 *   client key and DPoP helpers from `bluesky-oauth.ts`. Its client metadata is
 *   `/chat/bluesky-client.json`.
 *
 * A login in progress lives under `chat/pending/` for ten minutes, keyed by the hash of
 * its `state`, and a random cookie binds it to the browser that started it.
 */
import { parseHTML } from 'linkedom';
import type { ChatAuthor, ChatProvider } from '../../chat';
import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from '../publishing/public-fetch';
import { generateSigningKey, publicJwk, randomToken, sha256, type SigningKey } from '../publishing/dpop';
import { authorizationServer, clientKey, HANDLE, resolveDid, resolveHandle, serverPost, type ServerMetadata } from '../publishing/bluesky-oauth';

export const LOGIN_COOKIE = '__Host-chat-login';
const PENDING_TTL = 10 * 60_000;
const pendingKey = async (state: string) => `chat/pending/${await sha256(state)}.json`;

export class LoginError extends Error {}

type Pending =
	| { provider: 'indieauth'; me: string; authorizationEndpoint: string; issuer?: string; verifier: string }
	| { provider: 'mastodon'; instance: string; clientId: string; clientSecret: string }
	| { provider: 'bluesky'; did: string; handle: string; server: ServerMetadata; dpopKey: SigningKey; nonce?: string; verifier: string };

interface StoredPending { pending: Pending; binding: string; returnTo: string; createdAt: number }

export interface LoginContext {
	bucket: R2Bucket;
	/** The site origin the visitor is on, such as https://caseyagollan.com. */
	origin: string;
	fetcher?: PublicFetcher;
	now?: number;
}

export const redirectUri = (origin: string, provider: Exclude<ChatProvider, 'owner'>) => `${origin}/chat/login/${provider}/callback`;
export const indieAuthClientId = (origin: string) => `${origin}/chat/client.json`;
export const blueskyClientId = (origin: string) => `${origin}/chat/bluesky-client.json`;

/** Where to go after signing in: a /chat path on this site, nothing else. */
export function safeReturn(value: unknown): string {
	return typeof value === 'string' && /^\/chat(?:\/[a-z0-9]{10})?$/.test(value) ? value : '/chat';
}

async function savePending(context: LoginContext, pending: Pending, returnTo: string): Promise<{ state: string; binding: string }> {
	const state = randomToken(24), binding = randomToken(24);
	const stored: StoredPending = { pending, binding: await sha256(binding), returnTo, createdAt: context.now ?? Date.now() };
	await context.bucket.put(await pendingKey(state), JSON.stringify(stored));
	return { state, binding };
}

async function takePending(context: LoginContext, state: string | null, binding: string | undefined): Promise<StoredPending> {
	if (!state || state.length > 200) throw new LoginError('This sign-in has no state. Start again.');
	const key = await pendingKey(state);
	const object = await context.bucket.get(key);
	await context.bucket.delete(key);
	const stored = object ? await object.json<StoredPending>().catch(() => null) : null;
	if (!stored || (context.now ?? Date.now()) - stored.createdAt > PENDING_TTL) throw new LoginError('This sign-in expired. Start again.');
	if (!binding || await sha256(binding) !== stored.binding) throw new LoginError('Finish signing in in the browser that started it.');
	return stored;
}

async function json(response: Response, what: string): Promise<Record<string, unknown>> {
	if (!response.ok) throw new LoginError(`${what} answered ${response.status}.`);
	try { return await response.json() as Record<string, unknown>; } catch { throw new LoginError(`${what} did not answer with JSON.`); }
}

// ---------------------------------------------------------------- IndieAuth

/** A typed address as a profile URL: `example.com` becomes `https://example.com/`. */
export function profileAddress(value: string): string {
	const text = value.trim();
	const url = publicUrl(/^https?:\/\//i.test(text) ? text.replace(/^http:/i, 'https:') : `https://${text}`);
	url.hash = '';
	if (!url.pathname) url.pathname = '/';
	return url.href;
}

function linkHeader(header: string | null, rel: string, base: string): string | undefined {
	for (const part of header?.split(/,(?=\s*<)/) ?? []) {
		const match = /<([^>]+)>\s*;(.*)$/.exec(part.trim());
		if (match && new RegExp(`rel="?[^"]*\\b${rel}\\b`, 'i').test(match[2])) return new URL(match[1], base).href;
	}
}

/** The IndieAuth endpoints a profile URL names: metadata first, then the older link relation. */
export async function discoverIndieAuth(me: string, fetcher: PublicFetcher): Promise<{ me: string; authorizationEndpoint: string; issuer?: string }> {
	const response = await fetcher(me, { headers: { accept: 'text/html' }, redirect: 'follow' });
	if (!response.ok) throw new LoginError(`${new URL(me).host} answered ${response.status}.`);
	const finalUrl = response.url || me;
	const html = /html/i.test(response.headers.get('content-type') ?? '') ? await response.text() : '';
	const { document } = parseHTML(html || '<html></html>');
	const link = (rel: string) => linkHeader(response.headers.get('link'), rel, finalUrl) ?? (() => {
		const href = document.querySelector(`link[rel~="${rel}"][href]`)?.getAttribute('href');
		return href ? new URL(href, finalUrl).href : undefined;
	})();
	const metadataUrl = link('indieauth-metadata');
	if (metadataUrl) {
		const metadata = await json(await fetcher(publicUrl(metadataUrl).href, { headers: { accept: 'application/json' } }), 'The IndieAuth metadata');
		if (typeof metadata.authorization_endpoint !== 'string') throw new LoginError('The IndieAuth metadata names no authorization endpoint.');
		return { me: finalUrl, authorizationEndpoint: publicUrl(metadata.authorization_endpoint).href, ...(typeof metadata.issuer === 'string' ? { issuer: metadata.issuer } : {}) };
	}
	const endpoint = link('authorization_endpoint');
	if (!endpoint) throw new LoginError(`${new URL(me).host} doesn’t name an IndieAuth server. Add one, or sign in with Mastodon or Bluesky.`);
	return { me: finalUrl, authorizationEndpoint: publicUrl(endpoint).href };
}

export async function startIndieAuth(context: LoginContext, address: string, returnTo: string) {
	const fetcher = context.fetcher ?? safePublicFetch;
	const found = await discoverIndieAuth(profileAddress(address), fetcher);
	const verifier = randomToken(48);
	const { state, binding } = await savePending(context, { provider: 'indieauth', ...found, verifier }, returnTo);
	const target = new URL(found.authorizationEndpoint);
	for (const [key, value] of Object.entries({
		response_type: 'code', client_id: indieAuthClientId(context.origin), redirect_uri: redirectUri(context.origin, 'indieauth'),
		state, code_challenge: await sha256(verifier), code_challenge_method: 'S256', scope: 'profile', me: found.me
	})) target.searchParams.set(key, value);
	return { location: target.href, binding };
}

const sameHost = (a: string, b: string) => new URL(a).host === new URL(b).host;

async function finishIndieAuth(context: LoginContext, pending: Extract<Pending, { provider: 'indieauth' }>, query: URLSearchParams): Promise<ChatAuthor> {
	const fetcher = context.fetcher ?? safePublicFetch;
	if (pending.issuer && query.get('iss') !== pending.issuer) throw new LoginError('The sign-in came back from the wrong server.');
	const code = query.get('code');
	if (!code) throw new LoginError(query.get('error') === 'access_denied' ? 'Signing in was cancelled.' : 'The sign-in returned no code.');
	// Profile-only sign-in redeems the code at the authorization endpoint itself.
	const result = await json(await fetcher(pending.authorizationEndpoint, {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: indieAuthClientId(context.origin), redirect_uri: redirectUri(context.origin, 'indieauth'), code_verifier: pending.verifier })
	}), 'Your IndieAuth server');
	if (typeof result.me !== 'string') throw new LoginError('Your IndieAuth server named no profile.');
	const me = publicUrl(result.me).href;
	// A different profile URL than the one typed must use the same authorization server.
	if (!sameHost(me, pending.me)) {
		const again = await discoverIndieAuth(me, fetcher);
		if (again.authorizationEndpoint !== pending.authorizationEndpoint) throw new LoginError('That profile uses a different IndieAuth server.');
	}
	const profile = result.profile && typeof result.profile === 'object' ? result.profile as Record<string, unknown> : {};
	const name = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim().slice(0, 80) : new URL(me).host.replace(/^www\./, '');
	const photo = typeof profile.photo === 'string' && /^https:\/\//.test(profile.photo) ? profile.photo : undefined;
	return { id: `web:${me}`, name, url: me, ...(photo ? { photo } : {}), via: 'indieauth' };
}

// ---------------------------------------------------------------- Mastodon

/** A typed instance (`social.coop`, `@ana@social.coop` or a URL) as its HTTPS origin. */
export function instanceOrigin(value: string): string {
	const text = value.trim();
	const host = /^@?[^@\s]+@([^@\s/]+)$/.exec(text)?.[1] ?? text;
	const url = publicUrl(/^https?:\/\//i.test(host) ? host.replace(/^http:/i, 'https:') : `https://${host}`);
	return url.origin;
}

async function mastodonApp(context: LoginContext, instance: string): Promise<{ clientId: string; clientSecret: string }> {
	const key = `chat/mastodon-apps/${await sha256(`${instance} ${context.origin}`)}.json`;
	const cached = await context.bucket.get(key);
	if (cached) {
		const app = await cached.json<{ clientId: string; clientSecret: string }>().catch(() => null);
		if (app?.clientId && app.clientSecret) return app;
	}
	const fetcher = context.fetcher ?? safePublicFetch;
	const created = await json(await fetcher(`${instance}/api/v1/apps`, {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify({ client_name: 'caseyagollan.com chat', redirect_uris: redirectUri(context.origin, 'mastodon'), scopes: 'read:accounts', website: context.origin })
	}), `${new URL(instance).host}`);
	if (typeof created.client_id !== 'string' || typeof created.client_secret !== 'string') throw new LoginError(`${new URL(instance).host} didn’t register the app.`);
	const app = { clientId: created.client_id, clientSecret: created.client_secret };
	await context.bucket.put(key, JSON.stringify(app));
	return app;
}

export async function startMastodon(context: LoginContext, address: string, returnTo: string) {
	const instance = instanceOrigin(address);
	const app = await mastodonApp(context, instance);
	const { state, binding } = await savePending(context, { provider: 'mastodon', instance, ...app }, returnTo);
	const target = new URL(`${instance}/oauth/authorize`);
	for (const [key, value] of Object.entries({ response_type: 'code', client_id: app.clientId, redirect_uri: redirectUri(context.origin, 'mastodon'), scope: 'read:accounts', state })) target.searchParams.set(key, value);
	return { location: target.href, binding };
}

async function finishMastodon(context: LoginContext, pending: Extract<Pending, { provider: 'mastodon' }>, query: URLSearchParams): Promise<ChatAuthor> {
	const fetcher = context.fetcher ?? safePublicFetch;
	const code = query.get('code');
	if (!code) throw new LoginError(query.get('error') === 'access_denied' ? 'Signing in was cancelled.' : 'Mastodon returned no code.');
	const token = await json(await fetcher(`${pending.instance}/oauth/token`, {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: pending.clientId, client_secret: pending.clientSecret, redirect_uri: redirectUri(context.origin, 'mastodon'), scope: 'read:accounts' })
	}), 'Mastodon');
	if (typeof token.access_token !== 'string') throw new LoginError('Mastodon returned no token.');
	try {
		const account = await json(await fetcher(`${pending.instance}/api/v1/accounts/verify_credentials`, { headers: { accept: 'application/json', authorization: `Bearer ${token.access_token}` } }), 'Mastodon');
		if (typeof account.username !== 'string') throw new LoginError('Mastodon returned no account.');
		const host = new URL(pending.instance).host;
		const handle = `${account.username}@${host}`;
		const name = typeof account.display_name === 'string' && account.display_name.trim() ? account.display_name.trim().slice(0, 80) : `@${handle}`;
		return {
			id: `mastodon:${handle.toLowerCase()}`, name,
			...(typeof account.url === 'string' && /^https:\/\//.test(account.url) ? { url: account.url } : {}),
			...(typeof account.avatar === 'string' && /^https:\/\//.test(account.avatar) ? { photo: account.avatar } : {}),
			via: 'mastodon'
		};
	} finally {
		// The profile is all the chat needs; don't keep a token that can read the account.
		await fetcher(`${pending.instance}/oauth/revoke`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ client_id: pending.clientId, client_secret: pending.clientSecret, token: token.access_token as string })
		}).catch(() => undefined);
	}
}

// ---------------------------------------------------------------- Bluesky

/** The client metadata document for chat sign-in: identity only. */
export async function blueskyClientMetadata(bucket: R2Bucket, origin: string): Promise<Record<string, unknown>> {
	const key = await clientKey(bucket);
	return {
		client_id: blueskyClientId(origin), client_name: 'caseyagollan.com chat', client_uri: `${origin}/chat/`,
		application_type: 'web', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
		redirect_uris: [redirectUri(origin, 'bluesky')], scope: 'atproto',
		token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_signing_alg: 'ES256', dpop_bound_access_tokens: true,
		jwks: { keys: [{ ...publicJwk(key.publicJwk), kid: key.kid, alg: 'ES256', use: 'sig' }] }
	};
}

const blueskyClient = (context: LoginContext) => ({ bucket: context.bucket, clientId: blueskyClientId(context.origin) });

export async function startBluesky(context: LoginContext, address: string, returnTo: string) {
	const fetcher = context.fetcher ?? safePublicFetch;
	const handle = address.trim().replace(/^@/, '').toLowerCase();
	if (!HANDLE.test(handle) && !handle.startsWith('did:')) throw new LoginError('Type your Bluesky handle, such as name.bsky.social.');
	try {
		const did = handle.startsWith('did:') ? handle : await resolveHandle(handle, fetcher);
		const identity = await resolveDid(did, fetcher);
		if (!handle.startsWith('did:') && identity.handle !== handle) throw new LoginError('That Bluesky handle and its account don’t match.');
		const server = await authorizationServer(identity.pds, fetcher);
		const verifier = randomToken(48), dpopKey = await generateSigningKey();
		const pendingState = await savePending(context, { provider: 'bluesky', did, handle: identity.handle ?? did, server, dpopKey, verifier }, returnTo);
		const result = await serverPost(blueskyClient(context), server, server.pushed_authorization_request_endpoint, {
			response_type: 'code', redirect_uri: redirectUri(context.origin, 'bluesky'), scope: 'atproto', state: pendingState.state,
			code_challenge: await sha256(verifier), code_challenge_method: 'S256', login_hint: handle
		}, dpopKey, undefined, fetcher);
		if ((result.status !== 201 && result.status !== 200) || typeof result.json.request_uri !== 'string') throw new LoginError(`Bluesky refused the sign-in${typeof result.json.error === 'string' ? ` (${result.json.error})` : ''}.`);
		// Keep the DPoP nonce the server just handed out for the token request.
		const key = await pendingKey(pendingState.state);
		const stored = await (await context.bucket.get(key))?.json<StoredPending>();
		if (stored?.pending.provider === 'bluesky') await context.bucket.put(key, JSON.stringify({ ...stored, pending: { ...stored.pending, nonce: result.nonce } }));
		const target = new URL(server.authorization_endpoint);
		target.searchParams.set('client_id', blueskyClientId(context.origin));
		target.searchParams.set('request_uri', result.json.request_uri);
		return { location: target.href, binding: pendingState.binding };
	} catch (error) {
		if (error instanceof DeliveryError) throw new LoginError(error.message.endsWith('.') ? error.message : `${error.message}.`);
		throw error;
	}
}

async function finishBluesky(context: LoginContext, pending: Extract<Pending, { provider: 'bluesky' }>, query: URLSearchParams): Promise<ChatAuthor> {
	const fetcher = context.fetcher ?? safePublicFetch;
	if (query.get('iss') !== pending.server.issuer) throw new LoginError('The sign-in came back from the wrong server.');
	const code = query.get('code');
	if (!code) throw new LoginError(query.get('error') === 'access_denied' ? 'Signing in was cancelled.' : 'Bluesky returned no code.');
	const result = await serverPost(blueskyClient(context), pending.server, pending.server.token_endpoint, {
		grant_type: 'authorization_code', code, redirect_uri: redirectUri(context.origin, 'bluesky'), code_verifier: pending.verifier
	}, pending.dpopKey, pending.nonce, fetcher);
	if (result.status !== 200) throw new LoginError(`Bluesky refused the token request${typeof result.json.error === 'string' ? ` (${result.json.error})` : ''}.`);
	if (result.json.sub !== pending.did) throw new LoginError('Bluesky signed in a different account.');
	// The public profile, for a name and picture. Its absence doesn't stop the sign-in.
	let name = `@${pending.handle}`, photo: string | undefined;
	try {
		const profile = await json(await fetcher(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(pending.did)}`, { headers: { accept: 'application/json' } }), 'Bluesky');
		if (typeof profile.displayName === 'string' && profile.displayName.trim()) name = profile.displayName.trim().slice(0, 80);
		if (typeof profile.avatar === 'string' && /^https:\/\//.test(profile.avatar)) photo = profile.avatar;
	} catch { /* keep the handle */ }
	return { id: `bluesky:${pending.did}`, name, url: `https://bsky.app/profile/${pending.handle}`, ...(photo ? { photo } : {}), via: 'bluesky' };
}

export async function startLogin(context: LoginContext, provider: string, address: string, returnTo: string) {
	if (!address.trim() || address.length > 300) throw new LoginError('Type an address to sign in with.');
	try {
		if (provider === 'indieauth') return await startIndieAuth(context, address, returnTo);
		if (provider === 'mastodon') return await startMastodon(context, address, returnTo);
		if (provider === 'bluesky') return await startBluesky(context, address, returnTo);
	} catch (error) {
		if (error instanceof DeliveryError) throw new LoginError(error.message === 'URL must use a public HTTPS hostname' ? 'That address isn’t a public website.' : `${error.message}.`);
		throw error;
	}
	throw new LoginError('Unknown sign-in.');
}

export async function finishLogin(context: LoginContext, provider: string, query: URLSearchParams, binding: string | undefined): Promise<{ author: ChatAuthor; returnTo: string }> {
	const stored = await takePending(context, query.get('state'), binding);
	if (stored.pending.provider !== provider) throw new LoginError('This sign-in came back to the wrong place.');
	try {
		const pending = stored.pending;
		const author = pending.provider === 'indieauth' ? await finishIndieAuth(context, pending, query)
			: pending.provider === 'mastodon' ? await finishMastodon(context, pending, query)
			: await finishBluesky(context, pending, query);
		return { author, returnTo: stored.returnTo };
	} catch (error) {
		if (error instanceof DeliveryError) throw new LoginError(`${error.message}.`);
		throw error;
	}
}
