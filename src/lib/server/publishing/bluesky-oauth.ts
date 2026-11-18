/**
 * Bluesky (atproto) OAuth for syndication: the Worker is a confidential client with
 * DPoP-bound tokens, following https://atproto.com/specs/oauth.
 *
 * - The client's signing key, the session's DPoP key and its tokens live in the
 *   private `PUBLISHING_STATE` bucket under `private/bluesky-oauth/`.
 * - The owner connects once from /account: `startConnect` resolves the handle to its
 *   DID, PDS and authorization server, pushes the request (PAR + PKCE + DPoP), and
 *   `finishConnect` exchanges the code and checks the account is the one asked for.
 * - `blueskyAgent` hands syndication an authorized PDS fetch. It prefers OAuth and
 *   falls back to the app password (`PUBLISHING_BLUESKY_PASSWORD`) when OAuth is not
 *   connected or stops working, and notes why so /account can show it.
 */
import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from './public-fetch';
import { checkDeliveryResponse } from './webmention';
import { clientAssertion, dpopProof, generateSigningKey, publicJwk, randomToken, sha256, type SigningKey } from './dpop';

/**
 * Asked for: post records (create, and update so a retried send rewrites the same
 * record) and image uploads. Nothing else on the account.
 */
export const BLUESKY_SCOPE = 'atproto repo:app.bsky.feed.post?action=create&action=update blob:image/*';
/** Declared in the client metadata as well, so the scope can widen without a new client. */
const DECLARED_SCOPE = `${BLUESKY_SCOPE} transition:generic`;
const PREFIX = 'private/bluesky-oauth/';
const CLIENT_KEY = PREFIX + 'client-key.json';
const SESSION = PREFIX + 'session.json';
const USAGE = PREFIX + 'usage.json';
const LEASE = PREFIX + 'refresh-lease.json';
const pendingKey = async (state: string) => `${PREFIX}pending/${await sha256(state)}.json`;
const PENDING_TTL = 10 * 60_000;
/** Refresh this long before the access token expires. */
const REFRESH_EARLY = 60_000;
const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const DID = /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]+)$/;
const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Where the client lives, from the site's own address. */
export interface BlueskyOAuthConfig {
	bucket: R2Bucket;
	/** The client metadata document's URL, which is also the client id. */
	clientId: string;
	redirectUri: string;
	/** The account to connect, as a handle or DID. */
	account: string;
}
export function blueskyOAuthConfig(me: string, bucket: R2Bucket | undefined, account: string | undefined): BlueskyOAuthConfig | undefined {
	if (!bucket || !account?.trim()) return;
	let origin: string;
	try { origin = new URL(me).origin; } catch { return; }
	if (!origin.startsWith('https://')) return;
	return { bucket, clientId: `${origin}/oauth/bluesky/client-metadata.json`, redirectUri: `${origin}/oauth/bluesky/callback`, account: account.trim().replace(/^@/, '') };
}

/** Thrown when the OAuth session is gone or refused, so a send can use the app password. */
export class OAuthUnavailable extends Error {
	constructor(message: string) { super(message); this.name = 'OAuthUnavailable'; }
}

interface ClientKeyRecord { key: SigningKey; createdAt: number }
interface ServerMetadata { issuer: string; authorization_endpoint: string; token_endpoint: string; pushed_authorization_request_endpoint: string; revocation_endpoint?: string }
interface Pending { state: string; verifier: string; binding: string; did: string; handle: string; pds: string; server: ServerMetadata; dpopKey: SigningKey; nonce?: string; createdAt: number }
export interface StoredSession {
	did: string; handle: string; pds: string; server: ServerMetadata; scope: string;
	accessToken: string; refreshToken: string; expiresAt: number; dpopKey: SigningKey;
	authNonce?: string; pdsNonce?: string; connectedAt: number; refreshedAt?: number;
	/** Set when the authorization server refused a refresh; the owner reconnects. */
	broken?: { at: number; reason: string };
}
interface Usage { lastPostAt?: number; fallback?: { at: number; reason: string } }

/** What /account shows. Never includes tokens or keys. */
export interface BlueskyConnection {
	connected: boolean;
	handle?: string;
	did?: string;
	scope?: string;
	connectedAt?: number;
	/** The last post sent with OAuth. */
	lastPostAt?: number;
	/** The last time a send used the app password instead, and why. */
	fallback?: { at: number; reason: string };
	/** Set when the session needs reconnecting. */
	broken?: { at: number; reason: string };
	passwordFallback: boolean;
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<{ value: T; etag: string } | undefined> {
	const object = await bucket.get(key);
	if (!object) return;
	try { return { value: await object.json<T>(), etag: object.etag }; } catch { return; }
}

/** The client's signing key, made once and kept; its public half is in the client metadata. */
export async function clientKey(bucket: R2Bucket): Promise<SigningKey> {
	const stored = await readJson<ClientKeyRecord>(bucket, CLIENT_KEY);
	if (stored?.value.key?.privateJwk) return stored.value.key;
	const key = await generateSigningKey();
	const created = await bucket.put(CLIENT_KEY, JSON.stringify({ key, createdAt: Date.now() } satisfies ClientKeyRecord), { onlyIf: { etagDoesNotMatch: '*' } });
	if (created) return key;
	// Another request made it first: use that one.
	const winner = await readJson<ClientKeyRecord>(bucket, CLIENT_KEY);
	if (!winner?.value.key) throw new DeliveryError('Bluesky client key could not be stored', true);
	return winner.value.key;
}

/** The client metadata document served at the client id. */
export async function clientMetadata(config: BlueskyOAuthConfig): Promise<Record<string, unknown>> {
	const key = await clientKey(config.bucket);
	const origin = new URL(config.clientId).origin;
	return {
		client_id: config.clientId,
		client_name: 'caseyagollan.com',
		client_uri: origin,
		application_type: 'web',
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		redirect_uris: [config.redirectUri],
		scope: DECLARED_SCOPE,
		token_endpoint_auth_method: 'private_key_jwt',
		token_endpoint_auth_signing_alg: 'ES256',
		dpop_bound_access_tokens: true,
		jwks: { keys: [{ ...publicJwk(key.publicJwk), kid: key.kid, alg: 'ES256', use: 'sig' }] }
	};
}

async function getJson(fetcher: PublicFetcher, url: string, accept = 'application/json'): Promise<Record<string, unknown>> {
	const response = await fetcher(url, { headers: { accept } });
	checkDeliveryResponse(response);
	if (response.status !== 200) throw new DeliveryError('Unexpected identity response', false);
	try { return await response.json() as Record<string, unknown>; } catch { throw new DeliveryError('Invalid identity response', true); }
}
const httpsOrigin = (value: unknown): string => {
	if (typeof value !== 'string') throw new DeliveryError('Missing server address', false);
	const url = publicUrl(value);
	if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) throw new DeliveryError('Server address must be an HTTPS origin', false);
	return url.origin;
};

/** Handle to DID: the `_atproto` DNS TXT record, then the HTTPS well-known file. */
export async function resolveHandle(handle: string, fetcher: PublicFetcher): Promise<string> {
	if (!HANDLE.test(handle)) throw new DeliveryError('Invalid Bluesky handle', false);
	try {
		const dns = await getJson(fetcher, `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent('_atproto.' + handle)}&type=TXT`, 'application/dns-json');
		const found = ((dns.Answer as { type: number; data: string }[] | undefined) ?? [])
			.filter(answer => answer.type === 16).map(answer => answer.data.replace(/^"|"$/g, '').replace(/"\s*"/g, ''))
			.filter(text => text.startsWith('did=')).map(text => text.slice(4));
		if (found.length === 1 && DID.test(found[0])) return found[0];
	} catch { /* try HTTPS next */ }
	const response = await fetcher(`https://${handle}/.well-known/atproto-did`, { headers: { accept: 'text/plain' } });
	const did = response.ok ? (await response.text()).trim() : '';
	if (!DID.test(did)) throw new DeliveryError('Could not resolve the Bluesky handle', false);
	return did;
}

/** DID to its document: the PDS it lives on and the handle it claims. */
export async function resolveDid(did: string, fetcher: PublicFetcher): Promise<{ pds: string; handle?: string }> {
	if (!DID.test(did)) throw new DeliveryError('Invalid DID', false);
	const doc = await getJson(fetcher, did.startsWith('did:plc:') ? `https://plc.directory/${did}` : `https://${did.slice('did:web:'.length)}/.well-known/did.json`);
	if (doc.id !== did) throw new DeliveryError('DID document does not match', false);
	const services = Array.isArray(doc.service) ? doc.service as { id?: string; type?: string; serviceEndpoint?: unknown }[] : [];
	const pds = services.find(service => (service.id === '#atproto_pds' || service.id === `${did}#atproto_pds`) && service.type === 'AtprotoPersonalDataServer');
	const aka = Array.isArray(doc.alsoKnownAs) ? doc.alsoKnownAs as string[] : [];
	const handle = aka.find(value => typeof value === 'string' && value.startsWith('at://'))?.slice(5).toLowerCase();
	return { pds: httpsOrigin(pds?.serviceEndpoint), ...(handle ? { handle } : {}) };
}

/** The PDS's authorization server, checked against what atproto requires of it. */
export async function authorizationServer(pds: string, fetcher: PublicFetcher): Promise<ServerMetadata> {
	const resource = await getJson(fetcher, `${pds}/.well-known/oauth-protected-resource`);
	const servers = resource.authorization_servers;
	if (!Array.isArray(servers) || servers.length !== 1) throw new DeliveryError('PDS names no single authorization server', false);
	const issuer = httpsOrigin(servers[0]);
	const meta = await getJson(fetcher, `${issuer}/.well-known/oauth-authorization-server`);
	if (meta.issuer !== issuer) throw new DeliveryError('Authorization server issuer does not match', false);
	const endpoint = (name: string) => { const value = meta[name]; if (typeof value !== 'string') throw new DeliveryError(`Authorization server has no ${name}`, false); return publicUrl(value).href; };
	const supports = (name: string, value: string) => Array.isArray(meta[name]) && (meta[name] as unknown[]).includes(value);
	if (!supports('dpop_signing_alg_values_supported', 'ES256') || !supports('token_endpoint_auth_methods_supported', 'private_key_jwt') || !supports('scopes_supported', 'atproto') || meta.authorization_response_iss_parameter_supported !== true)
		throw new DeliveryError('Authorization server does not support the atproto OAuth profile', false);
	return {
		issuer, authorization_endpoint: endpoint('authorization_endpoint'), token_endpoint: endpoint('token_endpoint'),
		pushed_authorization_request_endpoint: endpoint('pushed_authorization_request_endpoint'),
		...(typeof meta.revocation_endpoint === 'string' ? { revocation_endpoint: publicUrl(meta.revocation_endpoint).href } : {})
	};
}

/** A token-endpoint style POST: client assertion and DPoP proof, retried once for a fresh nonce. */
async function serverPost(config: BlueskyOAuthConfig, server: ServerMetadata, url: string, params: Record<string, string>, dpopKey: SigningKey, nonce: string | undefined, fetcher: PublicFetcher) {
	const key = await clientKey(config.bucket);
	for (let attempt = 0; ; attempt++) {
		const body = new URLSearchParams({ ...params, client_id: config.clientId, client_assertion_type: ASSERTION_TYPE, client_assertion: await clientAssertion(key, config.clientId, server.issuer) });
		const response = await fetcher(url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', dpop: await dpopProof(dpopKey, 'POST', url, { nonce }) }, body });
		nonce = response.headers.get('dpop-nonce') ?? nonce;
		let json: Record<string, unknown> = {};
		try { json = await response.json() as Record<string, unknown>; } catch { /* checked below */ }
		if (response.status === 400 && json.error === 'use_dpop_nonce' && attempt === 0) continue;
		return { status: response.status, json, nonce };
	}
}

/**
 * Begin connecting: returns the authorization server's page to send the owner to.
 * `binding` is a random value also set as a cookie, so only this browser can finish.
 */
export async function startConnect(config: BlueskyOAuthConfig, binding: string, fetcher: PublicFetcher = safePublicFetch, now = Date.now()): Promise<string> {
	const did = config.account.startsWith('did:') ? config.account : await resolveHandle(config.account.toLowerCase(), fetcher);
	const identity = await resolveDid(did, fetcher);
	// A handle must point back at the DID that claims it.
	if (!config.account.startsWith('did:') && identity.handle !== config.account.toLowerCase()) throw new DeliveryError('The Bluesky handle and its DID do not match', false);
	const server = await authorizationServer(identity.pds, fetcher);
	const state = randomToken(), verifier = randomToken(48), dpopKey = await generateSigningKey();
	const result = await serverPost(config, server, server.pushed_authorization_request_endpoint, {
		response_type: 'code', redirect_uri: config.redirectUri, scope: BLUESKY_SCOPE, state,
		code_challenge: await sha256(verifier), code_challenge_method: 'S256', login_hint: config.account
	}, dpopKey, undefined, fetcher);
	if (result.status !== 201 && result.status !== 200 || typeof result.json.request_uri !== 'string') throw new DeliveryError(`Bluesky refused the sign-in request${typeof result.json.error === 'string' ? ` (${result.json.error})` : ''}`, result.status >= 500);
	const pending: Pending = { state, verifier, binding: await sha256(binding), did, handle: identity.handle ?? did, pds: identity.pds, server, dpopKey, nonce: result.nonce, createdAt: now };
	await config.bucket.put(await pendingKey(state), JSON.stringify(pending));
	const target = new URL(server.authorization_endpoint);
	target.searchParams.set('client_id', config.clientId);
	target.searchParams.set('request_uri', result.json.request_uri);
	return target.href;
}

/** Finish connecting from the callback's query, and store the session. */
export async function finishConnect(config: BlueskyOAuthConfig, query: URLSearchParams, binding: string | undefined, fetcher: PublicFetcher = safePublicFetch, now = Date.now()): Promise<BlueskyConnection> {
	const state = query.get('state');
	if (!state || state.length > 200) throw new DeliveryError('The Bluesky sign-in has no state', false);
	const key = await pendingKey(state);
	const stored = await readJson<Pending>(config.bucket, key);
	// Single use, whatever happens next.
	await config.bucket.delete(key);
	if (!stored) throw new DeliveryError('This Bluesky sign-in expired. Start again from your account page.', false);
	const pending = stored.value;
	if (now - pending.createdAt > PENDING_TTL) throw new DeliveryError('This Bluesky sign-in expired. Start again from your account page.', false);
	if (!binding || await sha256(binding) !== pending.binding) throw new DeliveryError('Finish connecting in the browser that started it.', false);
	if (query.get('iss') !== pending.server.issuer) throw new DeliveryError('The sign-in came back from the wrong server.', false);
	const error = query.get('error');
	if (error) throw new DeliveryError(error === 'access_denied' ? 'Bluesky access was not allowed.' : `Bluesky refused the sign-in (${error.slice(0, 80)}).`, false);
	const code = query.get('code');
	if (!code) throw new DeliveryError('The Bluesky sign-in returned no code.', false);
	const result = await serverPost(config, pending.server, pending.server.token_endpoint, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: pending.verifier }, pending.dpopKey, pending.nonce, fetcher);
	const tokens = checkTokens(result, pending.did, now);
	const session: StoredSession = { did: pending.did, handle: pending.handle, pds: pending.pds, server: pending.server, ...tokens, dpopKey: pending.dpopKey, authNonce: result.nonce, connectedAt: now };
	await config.bucket.put(SESSION, JSON.stringify(session));
	return connectionOf(session, await readJson<Usage>(config.bucket, USAGE).then(found => found?.value), false);
}

/** A token response, checked: DPoP-bound, for the expected account, with the atproto scope. */
function checkTokens(result: { status: number; json: Record<string, unknown> }, did: string, now: number) {
	const json = result.json;
	if (result.status !== 200) {
		const error = typeof json.error === 'string' ? json.error : `HTTP ${result.status}`;
		if (result.status >= 500 || result.status === 429) throw new DeliveryError(`Bluesky token request failed (${error})`, true);
		throw new OAuthUnavailable(`Bluesky refused the token request (${error})`);
	}
	if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string' || String(json.token_type).toLowerCase() !== 'dpop') throw new DeliveryError('Invalid Bluesky token response', true);
	if (json.sub !== did) throw new OAuthUnavailable('Bluesky signed in a different account');
	const scope = typeof json.scope === 'string' ? json.scope : '';
	if (!scope.split(' ').includes('atproto')) throw new OAuthUnavailable('Bluesky did not grant the atproto scope');
	const expiresIn = typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 300;
	return { accessToken: json.access_token, refreshToken: json.refresh_token, scope, expiresAt: now + expiresIn * 1000 };
}

function connectionOf(session: StoredSession | undefined, usage: Usage | undefined, passwordFallback: boolean): BlueskyConnection {
	if (!session) return { connected: false, passwordFallback, ...(usage?.fallback ? { fallback: usage.fallback } : {}) };
	return {
		connected: !session.broken, handle: session.handle, did: session.did, scope: session.scope, connectedAt: session.connectedAt, passwordFallback,
		...(usage?.lastPostAt ? { lastPostAt: usage.lastPostAt } : {}), ...(usage?.fallback ? { fallback: usage.fallback } : {}), ...(session.broken ? { broken: session.broken } : {})
	};
}
export async function connectionStatus(config: BlueskyOAuthConfig, passwordFallback: boolean): Promise<BlueskyConnection> {
	const [session, usage] = await Promise.all([readJson<StoredSession>(config.bucket, SESSION), readJson<Usage>(config.bucket, USAGE)]);
	return connectionOf(session?.value, usage?.value, passwordFallback);
}

/** Forget the session, revoking its refresh token on the authorization server first. */
export async function disconnect(config: BlueskyOAuthConfig, fetcher: PublicFetcher = safePublicFetch): Promise<void> {
	const stored = await readJson<StoredSession>(config.bucket, SESSION);
	if (stored?.value.server.revocation_endpoint && !stored.value.broken) {
		await serverPost(config, stored.value.server, stored.value.server.revocation_endpoint, { token: stored.value.refreshToken, token_type_hint: 'refresh_token' }, stored.value.dpopKey, stored.value.authNonce, fetcher).catch(() => undefined);
	}
	await config.bucket.delete([SESSION, USAGE]);
}

async function noteUsage(config: BlueskyOAuthConfig, change: Usage): Promise<void> {
	const usage = (await readJson<Usage>(config.bucket, USAGE))?.value ?? {};
	await config.bucket.put(USAGE, JSON.stringify({ ...usage, ...change })).catch(() => undefined);
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * New tokens for the stored session. Refresh tokens are single use, so one refresh runs
 * at a time under a lease; a request that finds the lease taken waits for the result.
 */
async function refresh(config: BlueskyOAuthConfig, stored: { value: StoredSession; etag: string }, fetcher: PublicFetcher, now: () => number): Promise<{ value: StoredSession; etag: string }> {
	const lease = await config.bucket.get(LEASE);
	const held = lease ? (await lease.json<{ until: number }>().catch(() => ({ until: 0 }))).until > now() : false;
	const claimed = held ? null : await config.bucket.put(LEASE, JSON.stringify({ until: now() + 30_000 }), { onlyIf: lease ? { etagMatches: lease.etag } : { etagDoesNotMatch: '*' } });
	if (!claimed) {
		for (let i = 0; i < 5; i++) {
			await wait(1000);
			const next = await readJson<StoredSession>(config.bucket, SESSION);
			if (!next) throw new OAuthUnavailable('Bluesky was disconnected');
			if (next.etag !== stored.etag) return next;
		}
		throw new DeliveryError('Bluesky token refresh is still running', true);
	}
	try {
		const session = stored.value;
		const result = await serverPost(config, session.server, session.server.token_endpoint, { grant_type: 'refresh_token', refresh_token: session.refreshToken }, session.dpopKey, session.authNonce, fetcher);
		let tokens: ReturnType<typeof checkTokens>;
		try { tokens = checkTokens(result, session.did, now()); }
		catch (error) {
			if (error instanceof OAuthUnavailable) {
				await config.bucket.put(SESSION, JSON.stringify({ ...session, broken: { at: now(), reason: error.message } } satisfies StoredSession), { onlyIf: { etagMatches: stored.etag } });
			}
			throw error;
		}
		const next: StoredSession = { ...session, ...tokens, authNonce: result.nonce, refreshedAt: now() };
		const saved = await config.bucket.put(SESSION, JSON.stringify(next), { onlyIf: { etagMatches: stored.etag } });
		// Changed underneath (a reconnect or disconnect): the new tokens still serve this send.
		return { value: next, etag: saved?.etag ?? '' };
	} finally {
		await config.bucket.put(LEASE, JSON.stringify({ until: 0 }), { onlyIf: { etagMatches: claimed.etag } }).catch(() => undefined);
	}
}

/** Sends one request to the account's PDS, authorized for this account. */
export interface BlueskyAgent {
	did: string;
	/** Shown in post URLs; the DID when the handle is not verified. */
	handle: string;
	/** The origin requests go to. */
	service: string;
	auth: 'oauth' | 'password';
	fetch(url: string, init: RequestInit & { method: string }): Promise<Response>;
}

/** A nonce challenge from a resource server: a 401 header, or a 400 body some servers use. */
async function wantsNonce(response: Response): Promise<boolean> {
	if (response.status === 401 && /error="?use_dpop_nonce/.test(response.headers.get('www-authenticate') ?? '')) return true;
	if (response.status !== 400 && response.status !== 401) return false;
	try { return (await response.clone().json() as { error?: string }).error === 'use_dpop_nonce'; } catch { return false; }
}

/** The OAuth agent, or undefined when Bluesky was never connected. */
export async function oauthAgent(config: BlueskyOAuthConfig, fetcher: PublicFetcher = safePublicFetch, now: () => number = Date.now): Promise<BlueskyAgent | undefined> {
	let stored = await readJson<StoredSession>(config.bucket, SESSION);
	if (!stored) return;
	if (stored.value.broken) throw new OAuthUnavailable(stored.value.broken.reason);
	if (stored.value.expiresAt - REFRESH_EARLY <= now()) stored = await refresh(config, stored, fetcher, now);
	let current = stored;
	const session = () => current.value;
	return {
		did: session().did, handle: session().handle, service: session().pds, auth: 'oauth',
		async fetch(url, init) {
			let refreshed = false, retriedNonce = false;
			for (;;) {
				const headers = new Headers(init.headers);
				headers.set('authorization', `DPoP ${session().accessToken}`);
				headers.set('dpop', await dpopProof(session().dpopKey, init.method, url, { nonce: session().pdsNonce, accessToken: session().accessToken, now: now() }));
				const response = await fetcher(url, { ...init, redirect: 'manual', headers });
				const nonce = response.headers.get('dpop-nonce');
				if (nonce) current = { ...current, value: { ...session(), pdsNonce: nonce } };
				if (await wantsNonce(response) && !retriedNonce) { retriedNonce = true; continue; }
				if (response.status === 401 && !refreshed) { refreshed = true; current = await refresh(config, current, fetcher, now); continue; }
				if (response.status === 401 || response.status === 403) throw new OAuthUnavailable(`Bluesky refused the OAuth token (HTTP ${response.status})`);
				return response;
			}
		}
	};
}

/** The app-password agent: `com.atproto.server.createSession` on the configured service. */
export async function passwordAgent(service: string, identifier: string, password: string, fetcher: PublicFetcher): Promise<BlueskyAgent> {
	const base = httpsOrigin(service);
	const response = await fetcher(base + '/xrpc/com.atproto.server.createSession', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
	checkDeliveryResponse(response);
	let session: Record<string, unknown>;
	try { session = await response.json() as Record<string, unknown>; } catch { throw new DeliveryError('Invalid provider response', true); }
	if (typeof session.did !== 'string' || !/^did:(plc:[a-z0-9]+|web:[A-Za-z0-9.:%_-]+)$/.test(session.did) || typeof session.accessJwt !== 'string') throw new DeliveryError('Invalid Bluesky session', true);
	const token = session.accessJwt;
	// Bridgy and readers expect handle URLs; the DID form is the fallback when the handle is unverified.
	const handle = typeof session.handle === 'string' && session.handle !== 'handle.invalid' && HANDLE.test(session.handle) ? session.handle : session.did;
	return {
		did: session.did, handle, service: base, auth: 'password',
		fetch: (url, init) => fetcher(url, { ...init, redirect: 'manual', headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${token}` } })
	};
}

export interface BlueskyAccount { service: string; identifier?: string; password?: string; oauth?: BlueskyOAuthConfig }

/** The agent a send uses: OAuth when connected, otherwise (or when OAuth fails) the app password. */
export async function blueskyAgent(account: BlueskyAccount, fetcher: PublicFetcher = safePublicFetch, now: () => number = Date.now): Promise<BlueskyAgent> {
	let reason: string | undefined;
	if (account.oauth) {
		try {
			const agent = await oauthAgent(account.oauth, fetcher, now);
			if (agent) return agent;
		} catch (error) {
			if (!(error instanceof OAuthUnavailable)) throw error;
			reason = error.message;
		}
	}
	return fallbackAgent(account, fetcher, reason, now);
}

/** The app-password agent after OAuth could not be used, noting why. */
export async function fallbackAgent(account: BlueskyAccount, fetcher: PublicFetcher, reason: string | undefined, now: () => number = Date.now): Promise<BlueskyAgent> {
	if (!account.identifier || !account.password) throw new DeliveryError(reason ? `Bluesky needs reconnecting: ${reason}` : 'Bluesky is not configured', false);
	const agent = await passwordAgent(account.service, account.identifier, account.password, fetcher);
	if (reason && account.oauth) await noteUsage(account.oauth, { fallback: { at: now(), reason } });
	return agent;
}

/** Record that OAuth carried a post, so the account page shows it working. */
export async function notePosted(account: BlueskyAccount, agent: BlueskyAgent, now = Date.now()): Promise<void> {
	if (agent.auth === 'oauth' && account.oauth) await noteUsage(account.oauth, { lastPostAt: now });
}
