/**
 * Casey's sign-ins to the MCP servers in `$lib/mcp-servers`, managed from /account.
 *
 * Each server is an OAuth 2.1 resource (the MCP authorization spec): the Worker finds its
 * authorization server from the protected-resource metadata, registers itself once per
 * site address (dynamic client registration, a public client with PKCE), sends Casey to
 * sign in, and keeps the tokens in the private `PUBLISHING_STATE` bucket under
 * `private/mcp/<server>/`. Nothing here is ever sent to a browser or written to a log.
 *
 * Are.na and Raindrop also take a personal token as the bearer; where the Worker already
 * holds one (`ARENA_PAT`, `RAINDROP_TOKEN`) it stands in until OAuth is connected.
 *
 * Beside the tokens sit the server's tool list (so the chat knows its tools without asking
 * on every message) and one setting: whether the chat may use the tools that change things.
 */
import { MCP_SERVERS, type McpConnection, type McpServer } from '../../mcp-servers';
import { randomToken, sha256 } from '../publishing/dpop';
import { McpAuthError, McpSession, readsOnly, type McpTool } from './client';

export interface McpEnv {
	PUBLISHING_STATE?: R2Bucket;
	ARENA_PAT?: string;
	RAINDROP_TOKEN?: string;
}

export interface McpDeps {
	bucket: R2Bucket;
	env: McpEnv;
	fetcher?: typeof fetch;
	now?: () => number;
}

/** Shown to Casey as it is; never carries a token or a server's raw answer. */
export class McpConnectError extends Error {
	constructor(message: string) { super(message); this.name = 'McpConnectError'; }
}

interface ServerMetadata { issuer: string; authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string; revocation_endpoint?: string }
interface ClientRecord { clientId: string; clientSecret?: string; redirectUri: string; issuer: string; registeredAt: number }
interface Pending { server: string; state: string; verifier: string; binding: string; redirectUri: string; resource: string; metadata: ServerMetadata; client: ClientRecord; createdAt: number }
interface StoredSession {
	accessToken: string; refreshToken?: string; expiresAt?: number; scope?: string;
	resource: string; metadata: ServerMetadata; client: ClientRecord; connectedAt: number; refreshedAt?: number;
	broken?: { at: number; reason: string };
}
export interface StoredTools { tools: McpTool[]; at: number }
interface Settings { writes?: boolean }

const PREFIX = 'private/mcp/';
const PENDING_TTL = 10 * 60_000;
const REFRESH_EARLY = 60_000;
/** A tool list older than this is fetched again the next time the chat needs it. */
export const TOOLS_TTL = 24 * 3600_000;
const sessionKey = (id: string) => `${PREFIX}${id}/session.json`;
const toolsKey = (id: string) => `${PREFIX}${id}/tools.json`;
const settingsKey = (id: string) => `${PREFIX}${id}/settings.json`;
const clientKey = async (id: string, redirectUri: string) => `${PREFIX}${id}/client-${(await sha256(redirectUri)).slice(0, 16)}.json`;
const pendingKey = async (state: string) => `${PREFIX}pending/${await sha256(state)}.json`;

export function mcpDeps(env: McpEnv | undefined, fetcher?: typeof fetch): McpDeps | undefined {
	return env?.PUBLISHING_STATE ? { bucket: env.PUBLISHING_STATE, env, fetcher } : undefined;
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | undefined> {
	const object = await bucket.get(key);
	if (!object) return undefined;
	try { return await object.json<T>(); } catch { return undefined; }
}
const writeJson = (bucket: R2Bucket, key: string, value: unknown) => bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } });

const https = (value: unknown): string | undefined => {
	try { const url = new URL(String(value)); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
};

async function getJson(deps: McpDeps, url: string): Promise<Record<string, unknown> | undefined> {
	const response = await (deps.fetcher ?? fetch)(url, { headers: { accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
	if (!response?.ok) { await response?.body?.cancel().catch(() => undefined); return undefined; }
	try { const value = await response.json(); return value && typeof value === 'object' ? value as Record<string, unknown> : undefined; } catch { return undefined; }
}

/**
 * Where to sign in for a server: its protected-resource metadata (RFC 9728) names the
 * authorization server, whose own metadata (RFC 8414, or OpenID's) names the endpoints.
 */
export async function discover(deps: McpDeps, server: McpServer): Promise<{ resource: string; scopes: string[]; metadata: ServerMetadata }> {
	const url = new URL(server.url);
	const path = url.pathname.replace(/\/+$/, '');
	// The server says where its metadata is when asked without a token.
	const probe = await (deps.fetcher ?? fetch)(server.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }), signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
	const hinted = /resource_metadata="([^"]+)"/.exec(probe?.headers.get('www-authenticate') ?? '')?.[1];
	await probe?.body?.cancel().catch(() => undefined);
	const places = [https(hinted), `${url.origin}/.well-known/oauth-protected-resource${path}`, `${url.origin}/.well-known/oauth-protected-resource`].filter((place): place is string => !!place && new URL(place).origin === url.origin);
	let resource: Record<string, unknown> | undefined;
	for (const place of [...new Set(places)]) { resource = await getJson(deps, place); if (resource) break; }
	const issuer = https((resource?.authorization_servers as unknown[] | undefined)?.[0]) ?? url.origin;
	const at = new URL(issuer), issuerPath = at.pathname.replace(/\/+$/, '');
	const candidates = [`${at.origin}/.well-known/oauth-authorization-server${issuerPath}`, `${at.origin}/.well-known/openid-configuration${issuerPath}`, `${at.origin}${issuerPath}/.well-known/oauth-authorization-server`, `${at.origin}${issuerPath}/.well-known/openid-configuration`];
	for (const candidate of [...new Set(candidates)]) {
		const found = await getJson(deps, candidate);
		const authorization = https(found?.authorization_endpoint), token = https(found?.token_endpoint);
		if (!found || !authorization || !token) continue;
		const methods = found.code_challenge_methods_supported;
		if (Array.isArray(methods) && !methods.includes('S256')) continue;
		return {
			resource: https(resource?.resource) ?? server.url,
			scopes: (Array.isArray(resource?.scopes_supported) ? resource.scopes_supported : Array.isArray(found.scopes_supported) ? found.scopes_supported : []).filter((scope): scope is string => typeof scope === 'string' && scope !== 'openid'),
			metadata: { issuer: typeof found.issuer === 'string' ? found.issuer : issuer, authorization_endpoint: authorization, token_endpoint: token, registration_endpoint: https(found.registration_endpoint), revocation_endpoint: https(found.revocation_endpoint) }
		};
	}
	throw new McpConnectError(`${server.name} didn’t say how to sign in. Try again in a moment.`);
}

/** This site as an OAuth client of the server, registered once per callback address. */
async function client(deps: McpDeps, server: McpServer, metadata: ServerMetadata, redirectUri: string, scopes: string[]): Promise<ClientRecord> {
	const key = await clientKey(server.id, redirectUri);
	const stored = await readJson<ClientRecord>(deps.bucket, key);
	if (stored?.clientId && stored.redirectUri === redirectUri && stored.issuer === metadata.issuer) return stored;
	if (!metadata.registration_endpoint) throw new McpConnectError(`${server.name} doesn’t let apps register themselves, so it can’t be connected from here.`);
	const origin = new URL(redirectUri).origin;
	const response = await (deps.fetcher ?? fetch)(metadata.registration_endpoint, {
		method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
		body: JSON.stringify({
			client_name: new URL(origin).host, client_uri: origin, redirect_uris: [redirectUri],
			grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
			...(scopes.length ? { scope: scopes.join(' ') } : {})
		})
	}).catch(() => undefined);
	const body = await response?.json().catch(() => undefined) as { client_id?: unknown; client_secret?: unknown; error?: unknown; error_description?: unknown } | undefined;
	if (!response?.ok || typeof body?.client_id !== 'string' || !body.client_id) {
		// The service's own reason, when it gives one: it is the only clue to what it wants.
		const reason = [body?.error_description, body?.error].find((value): value is string => typeof value === 'string' && !!value.trim())?.trim().slice(0, 200);
		throw new McpConnectError(`${server.name} didn’t accept this site as an app${response ? ` (${response.status})` : ''}${reason ? `: ${reason.replace(/\.$/, '')}` : ''}.`);
	}
	const record: ClientRecord = { clientId: body.client_id, ...(typeof body.client_secret === 'string' && body.client_secret ? { clientSecret: body.client_secret } : {}), redirectUri, issuer: metadata.issuer, registeredAt: (deps.now ?? Date.now)() };
	await writeJson(deps.bucket, key, record);
	return record;
}

/** Start a sign-in: the address of the server's sign-in page. `binding` ties the answer to this browser. */
export async function startConnect(deps: McpDeps, server: McpServer, origin: string, binding: string): Promise<string> {
	if (server.signIn === false) throw new McpConnectError(`${server.name} only lets apps it has approved sign in, so it works from its saved access token here.`);
	const redirectUri = `${new URL(origin).origin}/oauth/mcp/callback`;
	const found = await discover(deps, server);
	const registered = await client(deps, server, found.metadata, redirectUri, found.scopes);
	const state = randomToken(), verifier = randomToken(48);
	await writeJson(deps.bucket, await pendingKey(state), { server: server.id, state, verifier, binding, redirectUri, resource: found.resource, metadata: found.metadata, client: registered, createdAt: (deps.now ?? Date.now)() } satisfies Pending);
	const url = new URL(found.metadata.authorization_endpoint);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', registered.clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('state', state);
	url.searchParams.set('code_challenge', await sha256(verifier));
	url.searchParams.set('code_challenge_method', 'S256');
	url.searchParams.set('resource', found.resource);
	if (found.scopes.length) url.searchParams.set('scope', found.scopes.join(' '));
	return url.href;
}

interface TokenAnswer { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; error?: unknown }

async function tokenRequest(deps: McpDeps, metadata: ServerMetadata, registered: ClientRecord, form: Record<string, string>): Promise<{ ok: boolean; status: number; body: TokenAnswer }> {
	const response = await (deps.fetcher ?? fetch)(metadata.token_endpoint, {
		method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, signal: AbortSignal.timeout(20_000),
		body: new URLSearchParams({ ...form, client_id: registered.clientId, ...(registered.clientSecret ? { client_secret: registered.clientSecret } : {}) })
	});
	const body = await response.json().catch(() => ({})) as TokenAnswer;
	return { ok: response.ok && typeof body.access_token === 'string', status: response.status, body };
}

const tokensFrom = (body: TokenAnswer, now: number) => ({
	accessToken: String(body.access_token),
	...(typeof body.refresh_token === 'string' && body.refresh_token ? { refreshToken: body.refresh_token } : {}),
	...(Number(body.expires_in) > 0 ? { expiresAt: now + Number(body.expires_in) * 1000 } : {}),
	...(typeof body.scope === 'string' ? { scope: body.scope } : {})
});

/** Finish a sign-in from the callback's parameters. Returns the server that is now connected. */
export async function finishConnect(deps: McpDeps, params: URLSearchParams, binding: string | undefined): Promise<McpServer> {
	const state = params.get('state') ?? '';
	if (!state) throw new McpConnectError('The sign-in came back without its state. Start again from Account.');
	const key = await pendingKey(state);
	const pending = await readJson<Pending>(deps.bucket, key);
	await deps.bucket.delete(key);
	const now = (deps.now ?? Date.now)();
	const server = MCP_SERVERS.find((one) => one.id === pending?.server);
	if (!pending || !server || pending.state !== state || now - pending.createdAt > PENDING_TTL) throw new McpConnectError('That sign-in has expired. Start again from Account.');
	if (!binding || binding !== pending.binding) throw new McpConnectError('That sign-in was started in another browser. Start again from Account.');
	const issuer = params.get('iss');
	if (issuer && issuer !== pending.metadata.issuer) throw new McpConnectError(`The answer didn’t come from ${server.name}.`);
	if (params.get('error')) throw new McpConnectError(params.get('error') === 'access_denied' ? `${server.name} access was not allowed.` : `${server.name} refused the sign-in.`);
	const code = params.get('code');
	if (!code) throw new McpConnectError(`${server.name} sent no sign-in code.`);
	const answer = await tokenRequest(deps, pending.metadata, pending.client, { grant_type: 'authorization_code', code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier, resource: pending.resource }).catch(() => undefined);
	if (!answer?.ok) throw new McpConnectError(`${server.name} didn’t finish the sign-in${answer ? ` (${answer.status})` : ''}. Try again.`);
	await writeJson(deps.bucket, sessionKey(server.id), { ...tokensFrom(answer.body, now), resource: pending.resource, metadata: pending.metadata, client: pending.client, connectedAt: now } satisfies StoredSession);
	// What it offers, so the chat has its tools from the first message. A failure here is not a failed sign-in.
	await refreshTools(deps, server).catch(() => undefined);
	return server;
}

const refreshing = new Map<string, Promise<string>>();

/** The stored session's access token, refreshed when it is about to run out. */
async function oauthToken(deps: McpDeps, server: McpServer, session: StoredSession): Promise<string> {
	const now = (deps.now ?? Date.now)();
	if (!session.expiresAt || session.expiresAt - now > REFRESH_EARLY) return session.accessToken;
	if (!session.refreshToken) return session.accessToken;
	// One refresh at a time here: servers that rotate refresh tokens refuse the old one's second use.
	const running = refreshing.get(server.id);
	if (running) return running;
	const work = (async () => {
		const answer = await tokenRequest(deps, session.metadata, session.client, { grant_type: 'refresh_token', refresh_token: session.refreshToken!, resource: session.resource }).catch(() => undefined);
		if (!answer) return session.accessToken;
		if (!answer.ok) {
			// Another request may have refreshed it first; its tokens are in the bucket.
			const latest = await readJson<StoredSession>(deps.bucket, sessionKey(server.id));
			if (latest && latest.accessToken !== session.accessToken && !latest.broken) return latest.accessToken;
			if (answer.status >= 400 && answer.status < 500) await markBroken(deps, server, `${server.name} ended the sign-in (${typeof answer.body.error === 'string' ? answer.body.error.slice(0, 60) : answer.status})`);
			throw new McpAuthError(`${server.name} needs connecting again on the Account page.`);
		}
		const next: StoredSession = { ...session, ...tokensFrom(answer.body, now), refreshToken: typeof answer.body.refresh_token === 'string' && answer.body.refresh_token ? answer.body.refresh_token : session.refreshToken, refreshedAt: now };
		await writeJson(deps.bucket, sessionKey(server.id), next);
		return next.accessToken;
	})().finally(() => refreshing.delete(server.id));
	refreshing.set(server.id, work);
	return work;
}

const personalToken = (deps: McpDeps, server: McpServer) => server.tokenSecret ? deps.env[server.tokenSecret]?.trim() || undefined : undefined;

/** The bearer token for a server: OAuth when connected, else the personal token. Throws when there is neither. */
export async function bearer(deps: McpDeps, server: McpServer): Promise<string> {
	const session = await readJson<StoredSession>(deps.bucket, sessionKey(server.id));
	if (session?.accessToken && !session.broken) return oauthToken(deps, server, session);
	const token = personalToken(deps, server);
	if (token) return token;
	throw new McpAuthError(`${server.name} isn’t connected. Casey can connect it on the Account page.`);
}

/** The server refused the stored sign-in: remember why, so /account says to connect again. */
export async function markBroken(deps: McpDeps, server: McpServer, reason: string): Promise<void> {
	const session = await readJson<StoredSession>(deps.bucket, sessionKey(server.id));
	if (!session || session.broken) return;
	await writeJson(deps.bucket, sessionKey(server.id), { ...session, broken: { at: (deps.now ?? Date.now)(), reason } } satisfies StoredSession);
}

export function sessionFor(deps: McpDeps, server: McpServer): McpSession {
	return new McpSession(server.url, () => bearer(deps, server), deps.fetcher);
}

/** Ask the server what it offers and keep the answer. */
export async function refreshTools(deps: McpDeps, server: McpServer): Promise<StoredTools> {
	const listed = await sessionFor(deps, server).listTools();
	// Only what the chat needs of each tool; a server's extra fields stay out of the bucket.
	const tools = listed.slice(0, 200).map((tool): McpTool => ({ name: tool.name, ...(tool.description ? { description: tool.description } : {}), ...(tool.inputSchema && typeof tool.inputSchema === 'object' ? { inputSchema: tool.inputSchema } : {}), ...(tool.annotations ? { annotations: { readOnlyHint: tool.annotations.readOnlyHint, destructiveHint: tool.annotations.destructiveHint } } : {}) }));
	const stored: StoredTools = { tools, at: (deps.now ?? Date.now)() };
	await writeJson(deps.bucket, toolsKey(server.id), stored);
	return stored;
}

export interface UsableServer { server: McpServer; tools: McpTool[]; writes: boolean }

/**
 * The servers the chat can use now, each with the tools it may call: all of them when Casey
 * allowed changes, otherwise only the ones that read. A server with no kept tool list is
 * asked once; a stale list is used as it is and fetched again behind the answer (`later`).
 */
export async function usableServers(deps: McpDeps, later?: (work: Promise<unknown>) => void): Promise<UsableServer[]> {
	const now = (deps.now ?? Date.now)();
	const found = await Promise.all(MCP_SERVERS.map(async (server): Promise<UsableServer | undefined> => {
		const [session, settings, kept] = await Promise.all([readJson<StoredSession>(deps.bucket, sessionKey(server.id)), readJson<Settings>(deps.bucket, settingsKey(server.id)), readJson<StoredTools>(deps.bucket, toolsKey(server.id))]);
		if (!(session?.accessToken && !session.broken) && !personalToken(deps, server)) return undefined;
		let stored = kept;
		if (!stored?.tools) stored = await refreshTools(deps, server).catch(() => undefined);
		else if (now - stored.at > TOOLS_TTL) later?.(refreshTools(deps, server).catch(() => undefined));
		const writes = settings?.writes === true;
		const tools = (stored?.tools ?? []).filter((tool) => writes || readsOnly(tool));
		return tools.length ? { server, tools, writes } : undefined;
	}));
	return found.filter((one): one is UsableServer => !!one);
}

/** Forget a server's sign-in, telling the server where it can be told. */
export async function disconnect(deps: McpDeps, server: McpServer): Promise<void> {
	const session = await readJson<StoredSession>(deps.bucket, sessionKey(server.id));
	if (session?.metadata.revocation_endpoint) {
		const token = session.refreshToken ?? session.accessToken;
		await (deps.fetcher ?? fetch)(session.metadata.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000), body: new URLSearchParams({ token, client_id: session.client.clientId, ...(session.client.clientSecret ? { client_secret: session.client.clientSecret } : {}) }) }).then((response) => response.body?.cancel()).catch(() => undefined);
	}
	await deps.bucket.delete([sessionKey(server.id), toolsKey(server.id)]);
}

export async function setWrites(deps: McpDeps, server: McpServer, writes: boolean): Promise<void> {
	await writeJson(deps.bucket, settingsKey(server.id), { writes } satisfies Settings);
}

/**
 * List the tools of any usable server that has no kept list yet, so /account shows what a
 * token-only server offers without the chat having asked first. Each gets a few seconds; one
 * that fails keeps its “List them” button, which says why.
 */
export async function listMissingTools(deps: McpDeps, wait = 8000): Promise<void> {
	await Promise.all(MCP_SERVERS.map(async (server) => {
		const [session, stored] = await Promise.all([readJson<StoredSession>(deps.bucket, sessionKey(server.id)), readJson<StoredTools>(deps.bucket, toolsKey(server.id))]);
		if (stored?.tools || !((session?.accessToken && !session.broken) || personalToken(deps, server))) return;
		await Promise.race([refreshTools(deps, server).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, wait))]);
	}));
}

/** Why a server's tools could not be listed, in words for /account. */
export function listingProblem(server: McpServer, cause: unknown, deps: McpDeps): string {
	if (cause instanceof McpAuthError) return personalToken(deps, server) && server.signIn === false ? `${server.name} refused the access token saved with the site. It may have expired or been replaced.` : `${server.name} refused the sign-in. Connect it again.`;
	const detail = cause instanceof Error && cause.message ? `: ${cause.message.replace(/\.$/, '').slice(0, 200)}` : '';
	return `${server.name} didn’t list its tools${detail}.`;
}

/** What /account shows for every server. */
export async function connections(deps: McpDeps): Promise<McpConnection[]> {
	return Promise.all(MCP_SERVERS.map(async (server): Promise<McpConnection> => {
		const [session, settings, stored] = await Promise.all([readJson<StoredSession>(deps.bucket, sessionKey(server.id)), readJson<Settings>(deps.bucket, settingsKey(server.id)), readJson<StoredTools>(deps.bucket, toolsKey(server.id))]);
		const oauth = !!session?.accessToken && !session.broken;
		const via = oauth ? 'oauth' as const : personalToken(deps, server) ? 'token' as const : undefined;
		return {
			id: server.id, name: server.name, summary: server.summary, connected: oauth, signIn: server.signIn !== false, ...(via ? { via } : {}),
			...(oauth ? { connectedAt: session!.connectedAt } : {}),
			...(via && stored?.tools ? { tools: stored.tools.map((tool) => ({ name: tool.name, reads: readsOnly(tool) })), toolsAt: stored.at } : {}),
			writes: settings?.writes === true,
			...(session?.broken ? { broken: session.broken } : {})
		};
	}));
}
