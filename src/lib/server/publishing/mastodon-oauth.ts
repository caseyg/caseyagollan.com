/**
 * Mastodon OAuth for syndication, the counterpart of `bluesky-oauth.ts`.
 *
 * - Mastodon has no central server, so the site registers itself as an app on the
 *   instance it posts to (`POST /api/v1/apps`), once per instance and callback address,
 *   and keeps the client id and secret in the private `PUBLISHING_STATE` bucket under
 *   `private/mastodon-oauth/apps/`.
 * - The owner connects once from /account: `startConnect` sends them to the instance's
 *   authorization page (authorization code + PKCE), and `finishConnect` exchanges the
 *   code, reads which account approved, and stores the session.
 * - `mastodonCredentials` hands syndication and the importer a token. It prefers OAuth
 *   and falls back to the static token (`PUBLISHING_MASTODON_TOKEN`) when OAuth is not
 *   connected or the instance stops accepting it, and notes why so /account can show it.
 *
 * Mastodon access tokens do not expire, so there is nothing to refresh: a token works
 * until the owner disconnects here or revokes the app on the instance.
 *
 * Every address is checked with `publicUrl` and fetched with `safePublicFetch`, so an
 * instance name can never point the Worker at a private or literal address.
 */
import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from './public-fetch';
import { randomToken, sha256 } from './dpop';

/**
 * Asked for: posting and photo uploads, plus reading the account's own posts and
 * favourites, which the importer (PESOS) needs. Nothing else on the account.
 */
export const MASTODON_SCOPE = 'read:accounts read:statuses read:favourites write:statuses write:media';
const PREFIX = 'private/mastodon-oauth/';
const SESSION = PREFIX + 'session.json';
const USAGE = PREFIX + 'usage.json';
const pendingKey = async (state: string) => `${PREFIX}pending/${await sha256(state)}.json`;
const appKey = async (config: MastodonOAuthConfig) => `${PREFIX}apps/${await sha256(`${config.instance} ${config.redirectUri}`)}.json`;
const PENDING_TTL = 10 * 60_000;

export interface MastodonOAuthConfig {
	bucket: R2Bucket;
	/** The instance's HTTPS origin, such as https://social.coop. */
	instance: string;
	/** The site's own origin, shown to the instance as the app's website. */
	origin: string;
	redirectUri: string;
}

/** The instance a typed or configured value names, as a public HTTPS origin; undefined if it isn't one. */
export function instanceOrigin(value: string | undefined): string | undefined {
	const text = value?.trim();
	if (!text || text.length > 300) return;
	try {
		const url = publicUrl(/^https?:\/\//i.test(text) ? text : `https://${text}`);
		if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return;
		return url.origin;
	} catch { return; }
}

export function mastodonOAuthConfig(me: string, bucket: R2Bucket | undefined, instance: string | undefined): MastodonOAuthConfig | undefined {
	const host = instanceOrigin(instance);
	if (!bucket || !host) return;
	let origin: string;
	try { origin = new URL(me).origin; } catch { return; }
	if (!origin.startsWith('https://')) return;
	return { bucket, instance: host, origin, redirectUri: `${origin}/oauth/mastodon/callback` };
}

/** Thrown when the instance refuses the OAuth token, so a send can use the static token. */
export class MastodonOAuthRefused extends Error {
	constructor(message: string, public readonly status: number) { super(message); this.name = 'MastodonOAuthRefused'; }
}

interface App { clientId: string; clientSecret: string; createdAt: number }
interface Pending { verifier: string; binding: string; clientId: string; clientSecret: string; createdAt: number }
interface StoredSession {
	instance: string; clientId: string; clientSecret: string; accessToken: string; scope: string;
	account: { id: string; acct: string; url?: string };
	connectedAt: number;
	/** Set when the instance refused the token; the owner reconnects. */
	broken?: { at: number; reason: string };
}
interface Usage { lastPostAt?: number; fallback?: { at: number; reason: string } }

/** What /account shows. Never includes the token or the client secret. */
export interface MastodonConnection {
	connected: boolean;
	/** The instance's host, such as social.coop. */
	instance: string;
	/** The account that approved, as user@host. */
	account?: string;
	accountUrl?: string;
	scope?: string;
	connectedAt?: number;
	/** The last post sent with OAuth. */
	lastPostAt?: number;
	/** The last time a send used the static token instead, and why. */
	fallback?: { at: number; reason: string };
	/** Set when the connection needs making again. */
	broken?: { at: number; reason: string };
	tokenFallback: boolean;
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<{ value: T; etag: string } | undefined> {
	const object = await bucket.get(key);
	if (!object) return;
	try { return { value: await object.json<T>(), etag: object.etag }; } catch { return; }
}

const form = (fetcher: PublicFetcher, url: string, params: Record<string, string>) =>
	fetcher(url, { method: 'POST', redirect: 'manual', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });

async function body(response: Response): Promise<Record<string, unknown>> {
	try { const value = await response.json(); return value && typeof value === 'object' ? value as Record<string, unknown> : {}; } catch { return {}; }
}

/** The session, when it belongs to the configured instance. A session for another instance is as good as none. */
async function session(config: MastodonOAuthConfig): Promise<{ value: StoredSession; etag: string } | undefined> {
	const stored = await readJson<StoredSession>(config.bucket, SESSION);
	return stored?.value.instance === config.instance && typeof stored.value.accessToken === 'string' ? stored : undefined;
}

/** The app registered on this instance for this site, made on first use and kept. */
async function registeredApp(config: MastodonOAuthConfig, fetcher: PublicFetcher, now: number): Promise<App> {
	const key = await appKey(config);
	const stored = await readJson<App>(config.bucket, key);
	if (stored?.value.clientId && stored.value.clientSecret) return stored.value;
	const host = new URL(config.instance).host;
	const response = await fetcher(`${config.instance}/api/v1/apps`, {
		method: 'POST', redirect: 'manual', headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify({ client_name: new URL(config.origin).host, redirect_uris: config.redirectUri, scopes: MASTODON_SCOPE, website: config.origin })
	});
	const created = await body(response);
	if (!response.ok || typeof created.client_id !== 'string' || typeof created.client_secret !== 'string') throw new DeliveryError(`${host} did not register this site as an app (HTTP ${response.status})`, response.status >= 500 || response.status === 429);
	const app: App = { clientId: created.client_id, clientSecret: created.client_secret, createdAt: now };
	await config.bucket.put(key, JSON.stringify(app));
	return app;
}

/**
 * Begin connecting: returns the instance's authorization page to send the owner to.
 * `binding` is a random value also set as a cookie, so only this browser can finish.
 */
export async function startConnect(config: MastodonOAuthConfig, binding: string, fetcher: PublicFetcher = safePublicFetch, now = Date.now()): Promise<string> {
	const app = await registeredApp(config, fetcher, now);
	const state = randomToken(), verifier = randomToken(48);
	const pending: Pending = { verifier, binding: await sha256(binding), clientId: app.clientId, clientSecret: app.clientSecret, createdAt: now };
	await config.bucket.put(await pendingKey(state), JSON.stringify(pending));
	const target = new URL(`${config.instance}/oauth/authorize`);
	for (const [key, value] of Object.entries({
		response_type: 'code', client_id: app.clientId, redirect_uri: config.redirectUri, scope: MASTODON_SCOPE, state,
		code_challenge: await sha256(verifier), code_challenge_method: 'S256'
	})) target.searchParams.set(key, value);
	return target.href;
}

const revoke = (config: MastodonOAuthConfig, stored: Pick<StoredSession, 'clientId' | 'clientSecret' | 'accessToken'>, fetcher: PublicFetcher) =>
	form(fetcher, `${config.instance}/oauth/revoke`, { client_id: stored.clientId, client_secret: stored.clientSecret, token: stored.accessToken }).then(() => undefined, () => undefined);

/** Finish connecting from the callback's query, and store the session. */
export async function finishConnect(config: MastodonOAuthConfig, query: URLSearchParams, binding: string | undefined, fetcher: PublicFetcher = safePublicFetch, now = Date.now()): Promise<MastodonConnection> {
	const host = new URL(config.instance).host;
	const state = query.get('state');
	if (!state || state.length > 200) throw new DeliveryError('The Mastodon sign-in has no state', false);
	const key = await pendingKey(state);
	const stored = await readJson<Pending>(config.bucket, key);
	// Single use, whatever happens next.
	await config.bucket.delete(key);
	if (!stored || now - stored.value.createdAt > PENDING_TTL) throw new DeliveryError('This Mastodon sign-in expired. Start again from your account page.', false);
	const pending = stored.value;
	if (!binding || await sha256(binding) !== pending.binding) throw new DeliveryError('Finish connecting in the browser that started it.', false);
	const error = query.get('error');
	if (error) throw new DeliveryError(error === 'access_denied' ? 'Mastodon access was not allowed.' : `${host} refused the sign-in (${error.slice(0, 80)}).`, false);
	const code = query.get('code');
	if (!code || code.length > 500) throw new DeliveryError('The Mastodon sign-in returned no code.', false);

	const response = await form(fetcher, `${config.instance}/oauth/token`, {
		grant_type: 'authorization_code', code, client_id: pending.clientId, client_secret: pending.clientSecret,
		redirect_uri: config.redirectUri, code_verifier: pending.verifier, scope: MASTODON_SCOPE
	});
	const token = await body(response);
	if (!response.ok) {
		// The instance no longer knows the app (wiped, or the app was deleted): register afresh next time.
		if (token.error === 'invalid_client') await config.bucket.delete(await appKey(config));
		throw new DeliveryError(`${host} refused the token request (${typeof token.error === 'string' ? token.error.slice(0, 80) : `HTTP ${response.status}`})`, response.status >= 500 || response.status === 429);
	}
	if (typeof token.access_token !== 'string' || String(token.token_type).toLowerCase() !== 'bearer') throw new DeliveryError('Invalid Mastodon token response', true);
	const fresh = { clientId: pending.clientId, clientSecret: pending.clientSecret, accessToken: token.access_token };
	const scope = typeof token.scope === 'string' ? token.scope : '';
	const granted = new Set(scope.split(/\s+/));
	if (!granted.has('write:statuses') && !granted.has('write')) {
		await revoke(config, fresh, fetcher);
		throw new DeliveryError('Mastodon did not allow posting.', false);
	}

	const who = await fetcher(`${config.instance}/api/v1/accounts/verify_credentials`, { redirect: 'manual', headers: { accept: 'application/json', authorization: `Bearer ${token.access_token}` } });
	const account = await body(who);
	if (!who.ok || typeof account.id !== 'string' || typeof account.username !== 'string') {
		await revoke(config, fresh, fetcher);
		throw new DeliveryError(`${host} did not say which account signed in`, who.status >= 500);
	}
	let url: string | undefined;
	try { if (typeof account.url === 'string') url = publicUrl(account.url).href; } catch { /* no link */ }

	// A reconnect replaces the earlier token: don't leave it valid on the instance.
	const previous = await session(config);
	if (previous && previous.value.accessToken !== token.access_token) await revoke(config, previous.value, fetcher);
	const next: StoredSession = { instance: config.instance, ...fresh, scope, account: { id: account.id, acct: `${account.username}@${host}`, ...(url ? { url } : {}) }, connectedAt: now };
	await config.bucket.put(SESSION, JSON.stringify(next));
	return connectionOf(config, next, (await readJson<Usage>(config.bucket, USAGE))?.value, false);
}

function connectionOf(config: MastodonOAuthConfig, stored: StoredSession | undefined, usage: Usage | undefined, tokenFallback: boolean): MastodonConnection {
	const instance = new URL(config.instance).host;
	if (!stored) return { connected: false, instance, tokenFallback, ...(usage?.fallback ? { fallback: usage.fallback } : {}) };
	return {
		connected: !stored.broken, instance, account: stored.account.acct, ...(stored.account.url ? { accountUrl: stored.account.url } : {}), scope: stored.scope, connectedAt: stored.connectedAt, tokenFallback,
		...(usage?.lastPostAt ? { lastPostAt: usage.lastPostAt } : {}), ...(usage?.fallback ? { fallback: usage.fallback } : {}), ...(stored.broken ? { broken: stored.broken } : {})
	};
}

export async function connectionStatus(config: MastodonOAuthConfig, tokenFallback: boolean): Promise<MastodonConnection> {
	const [stored, usage] = await Promise.all([session(config), readJson<Usage>(config.bucket, USAGE)]);
	return connectionOf(config, stored?.value, usage?.value, tokenFallback);
}

/** Forget the session, revoking its token on the instance first. */
export async function disconnect(config: MastodonOAuthConfig, fetcher: PublicFetcher = safePublicFetch): Promise<void> {
	const stored = await session(config);
	if (stored && !stored.value.broken) await revoke(config, stored.value, fetcher);
	await config.bucket.delete([SESSION, USAGE]);
}

async function noteUsage(config: MastodonOAuthConfig, change: Usage): Promise<void> {
	const usage = (await readJson<Usage>(config.bucket, USAGE))?.value ?? {};
	await config.bucket.put(USAGE, JSON.stringify({ ...usage, ...change })).catch(() => undefined);
}

/** How syndication is configured to reach Mastodon: OAuth, the static token, or both. */
export interface MastodonAccount { instance: string; token?: string; oauth?: MastodonOAuthConfig }
/** What a request is sent with. */
export interface MastodonCredentials { instance: string; token: string; auth: 'oauth' | 'token' }

/** The credentials a send uses: OAuth when connected, otherwise the static token. */
export async function mastodonCredentials(account: MastodonAccount, now: () => number = Date.now): Promise<MastodonCredentials> {
	let reason: string | undefined;
	if (account.oauth) {
		const stored = await session(account.oauth);
		if (stored && !stored.value.broken) return { instance: account.oauth.instance, token: stored.value.accessToken, auth: 'oauth' };
		reason = stored?.value.broken?.reason;
	}
	return mastodonFallback(account, reason, now);
}

/** The static token after OAuth could not be used, noting why. */
export async function mastodonFallback(account: MastodonAccount, reason: string | undefined, now: () => number = Date.now): Promise<MastodonCredentials> {
	if (!account.token?.trim()) throw new DeliveryError(reason ? `Mastodon needs reconnecting: ${reason}` : 'Mastodon is not connected', false);
	if (reason && account.oauth) await noteUsage(account.oauth, { fallback: { at: now(), reason } });
	return { instance: account.instance, token: account.token, auth: 'token' };
}

/**
 * A fetcher for requests made with the OAuth token: a 401 or 403 becomes
 * `MastodonOAuthRefused`, so the caller can switch to the static token.
 */
export function refusable(fetcher: PublicFetcher): PublicFetcher {
	return async (url, init) => {
		const response = await fetcher(url, init);
		if (response.status === 401 || response.status === 403) {
			await response.body?.cancel().catch(() => undefined);
			throw new MastodonOAuthRefused(`Mastodon refused the OAuth token (HTTP ${response.status})`, response.status);
		}
		return response;
	};
}

/** After a refusal: a 401 means the token is gone for good, so the session is marked for reconnecting. */
export async function noteRefused(account: MastodonAccount, refusal: MastodonOAuthRefused, now: () => number = Date.now): Promise<void> {
	if (!account.oauth || refusal.status !== 401) return;
	const stored = await session(account.oauth);
	if (stored && !stored.value.broken) await account.oauth.bucket.put(SESSION, JSON.stringify({ ...stored.value, broken: { at: now(), reason: refusal.message } } satisfies StoredSession), { onlyIf: { etagMatches: stored.etag } }).catch(() => undefined);
}

/** Record that OAuth carried a post, so the account page shows it working. */
export async function notePosted(account: MastodonAccount, credentials: MastodonCredentials, now = Date.now()): Promise<void> {
	if (credentials.auth === 'oauth' && account.oauth) await noteUsage(account.oauth, { lastPostAt: now });
}
