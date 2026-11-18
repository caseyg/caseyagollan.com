import { expect, test } from 'bun:test';
import { blueskyOAuthConfig, clientMetadata, connectionStatus, disconnect, finishConnect, startConnect, BLUESKY_SCOPE } from '../src/lib/server/publishing/bluesky-oauth';
import { sha256 } from '../src/lib/server/publishing/dpop';
import { syndicate } from '../src/lib/server/publishing/syndication';
import { publishingConfig } from '../src/lib/server/publishing/config';

const DID = 'did:plc:abcdefghijklmnopqrstuvwx';
const PDS = 'https://pds.example.com';
const AS = 'https://auth.example.com';

function bucket() {
	const files = new Map<string, { etag: string; data: string }>();
	let version = 0;
	const fake = {
		files,
		async get(key: string) { const value = files.get(key); return value ? { etag: value.etag, json: async () => JSON.parse(value.data), text: async () => value.data } : null; },
		async put(key: string, data: string, options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }) {
			const current = files.get(key), condition = options?.onlyIf;
			if (condition?.etagMatches && current?.etag !== condition.etagMatches) return null;
			if (condition?.etagDoesNotMatch === '*' && current) return null;
			const etag = String(++version);
			files.set(key, { etag, data });
			return { etag };
		},
		async delete(keys: string | string[]) { for (const key of [keys].flat()) files.delete(key); }
	};
	return fake;
}

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());
/** Check a JWS's ES256 signature against the key in its header, or the one given. */
async function verify(jwt: string, jwk?: JsonWebKey) {
	const [h, p, s] = jwt.split('.');
	const header = decode(h);
	const key = await crypto.subtle.importKey('jwk', jwk ?? header.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
	const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`));
	return { ok, header, payload: decode(p) };
}

/** A PDS and authorization server that insist on DPoP nonces, as Bluesky's do. */
function network(options: { refresh?: 'ok' | 'invalid_grant'; putStatus?: number; expiresIn?: number } = {}) {
	const calls: { url: string; init?: RequestInit; form?: URLSearchParams; json?: Record<string, unknown> }[] = [];
	let refreshCount = 0;
	const fetcher = async (url: string, init: RequestInit = {}) => {
		const form = init.body instanceof URLSearchParams ? init.body : undefined;
		const json = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
		calls.push({ url, init, form, json });
		const headers = new Headers(init.headers);
		if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Status: 0, Answer: [{ type: 16, data: `"did=${DID}"` }] });
		if (url === `https://plc.directory/${DID}`) return Response.json({ id: DID, alsoKnownAs: ['at://caseyagollan.com'], service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: PDS }] });
		if (url === `${PDS}/.well-known/oauth-protected-resource`) return Response.json({ resource: PDS, authorization_servers: [AS] });
		if (url === `${AS}/.well-known/oauth-authorization-server`) return Response.json({
			issuer: AS, authorization_endpoint: `${AS}/oauth/authorize`, token_endpoint: `${AS}/oauth/token`, pushed_authorization_request_endpoint: `${AS}/oauth/par`, revocation_endpoint: `${AS}/oauth/revoke`,
			dpop_signing_alg_values_supported: ['ES256'], token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'], scopes_supported: ['atproto', 'transition:generic'], authorization_response_iss_parameter_supported: true
		});
		if (url.startsWith(AS + '/oauth/')) {
			const proof = decode(headers.get('dpop')!.split('.')[1]);
			if (proof.nonce !== 'as-nonce') return Response.json({ error: 'use_dpop_nonce' }, { status: 400, headers: { 'dpop-nonce': 'as-nonce' } });
			if (url.endsWith('/par')) return Response.json({ request_uri: 'urn:ietf:params:oauth:request_uri:abc', expires_in: 300 }, { status: 201, headers: { 'dpop-nonce': 'as-nonce' } });
			if (url.endsWith('/revoke')) return new Response(null, { status: 200, headers: { 'dpop-nonce': 'as-nonce' } });
			if (form?.get('grant_type') === 'refresh_token') {
				refreshCount++;
				if (options.refresh === 'invalid_grant') return Response.json({ error: 'invalid_grant' }, { status: 400, headers: { 'dpop-nonce': 'as-nonce' } });
				return Response.json({ access_token: `access-${refreshCount + 1}`, refresh_token: `refresh-${refreshCount + 1}`, token_type: 'DPoP', expires_in: 900, scope: BLUESKY_SCOPE, sub: DID }, { headers: { 'dpop-nonce': 'as-nonce' } });
			}
			return Response.json({ access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'DPoP', expires_in: options.expiresIn ?? 900, scope: BLUESKY_SCOPE, sub: form?.get('code') === 'other' ? 'did:plc:zzzzzzzzzzzzzzzzzzzzzzzz' : DID }, { headers: { 'dpop-nonce': 'as-nonce' } });
		}
		if (url.startsWith(PDS + '/xrpc/')) {
			if (headers.get('authorization')?.startsWith('Bearer ')) return Response.json({ uri: 'at://x', cid: 'cid-password' });
			const proof = decode(headers.get('dpop')!.split('.')[1]);
			if (proof.nonce !== 'pds-nonce') return Response.json({ error: 'use_dpop_nonce' }, { status: 401, headers: { 'dpop-nonce': 'pds-nonce', 'www-authenticate': 'DPoP error="use_dpop_nonce"' } });
			if (options.putStatus) return Response.json({ error: 'Forbidden' }, { status: options.putStatus, headers: { 'dpop-nonce': 'pds-nonce' } });
			return Response.json({ uri: 'at://x', cid: 'cid-1' }, { headers: { 'dpop-nonce': 'pds-nonce' } });
		}
		if (url.startsWith('https://bsky.social/xrpc/com.atproto.repo.') && headers.get('authorization') === 'Bearer password-jwt') return Response.json({ uri: 'at://x', cid: 'cid-password' });
		if (url === 'https://bsky.social/xrpc/com.atproto.server.createSession') return Response.json({ did: DID, handle: 'caseyagollan.com', accessJwt: 'password-jwt' });
		throw new Error('Unexpected fetch ' + url);
	};
	return { fetcher, calls, refreshes: () => refreshCount };
}

const config = (store: ReturnType<typeof bucket>) => blueskyOAuthConfig('https://caseyagollan.com/', store as unknown as R2Bucket, 'caseyagollan.com')!;

async function connected(options: Parameters<typeof network>[0] = {}) {
	const store = bucket(), oauth = config(store), net = network(options);
	const page = new URL(await startConnect(oauth, 'browser-1', net.fetcher));
	const par = net.calls.filter(call => call.url === `${AS}/oauth/par`).at(-1)!.form!;
	const query = new URLSearchParams({ state: par.get('state')!, iss: AS, code: 'code-1' });
	await finishConnect(oauth, query, 'browser-1', net.fetcher);
	return { store, oauth, net, page, par };
}

test('client metadata is a confidential, DPoP-bound web client with a stable key', async () => {
	const store = bucket(), oauth = config(store);
	expect(oauth.clientId).toBe('https://caseyagollan.com/oauth/bluesky/client-metadata.json');
	const meta = await clientMetadata(oauth);
	expect(meta).toMatchObject({ client_id: oauth.clientId, redirect_uris: ['https://caseyagollan.com/oauth/bluesky/callback'], token_endpoint_auth_method: 'private_key_jwt', dpop_bound_access_tokens: true, grant_types: ['authorization_code', 'refresh_token'] });
	expect(String(meta.scope).split(' ')).toContain('atproto');
	const [key] = (meta.jwks as { keys: JsonWebKey[] }).keys;
	expect(key).not.toHaveProperty('d');
	expect((await clientMetadata(oauth)).jwks).toEqual(meta.jwks);
});

test('connecting resolves the handle, pushes a PKCE request with DPoP, and checks the account', async () => {
	const { store, oauth, net, page, par } = await connected();
	expect(page.origin + page.pathname).toBe(`${AS}/oauth/authorize`);
	expect(page.searchParams.get('request_uri')).toBe('urn:ietf:params:oauth:request_uri:abc');
	expect(par.get('code_challenge_method')).toBe('S256');
	expect(par.get('scope')).toBe(BLUESKY_SCOPE);
	expect(par.get('login_hint')).toBe('caseyagollan.com');
	// The client assertion is signed by the published key, for this server.
	const meta = await clientMetadata(oauth);
	const assertion = await verify(par.get('client_assertion')!, (meta.jwks as { keys: JsonWebKey[] }).keys[0]);
	expect(assertion.ok).toBe(true);
	expect(assertion.payload).toMatchObject({ iss: oauth.clientId, sub: oauth.clientId, aud: AS });
	// The first PAR got a nonce challenge; the retry carried it.
	const parCalls = net.calls.filter(call => call.url === `${AS}/oauth/par`);
	expect(parCalls).toHaveLength(2);
	const proof = await verify(new Headers(parCalls[1].init!.headers).get('dpop')!);
	expect(proof.ok).toBe(true);
	expect(proof.header.typ).toBe('dpop+jwt');
	expect(proof.payload).toMatchObject({ htm: 'POST', htu: `${AS}/oauth/par`, nonce: 'as-nonce' });
	// The code exchange proves the verifier, and the session is stored.
	const token = net.calls.find(call => call.form?.get('grant_type') === 'authorization_code')!.form!;
	expect(await sha256(token.get('code_verifier')!)).toBe(par.get('code_challenge')!);
	expect(await connectionStatus(oauth, true)).toMatchObject({ connected: true, handle: 'caseyagollan.com', did: DID, passwordFallback: true });
	expect([...store.files.keys()].some(key => key.includes('/pending/'))).toBe(false);
});

test('a sign-in only finishes in the browser that started it, from the right server, for the right account', async () => {
	const store = bucket(), oauth = config(store), net = network();
	const start = async () => { await startConnect(oauth, 'browser-1', net.fetcher, 1_000); return net.calls.filter(call => call.url === `${AS}/oauth/par`).at(-1)!.form!.get('state')!; };
	await expect(finishConnect(oauth, new URLSearchParams({ state: await start(), iss: AS, code: 'c' }), 'browser-2', net.fetcher, 2_000)).rejects.toThrow('browser');
	await expect(finishConnect(oauth, new URLSearchParams({ state: await start(), iss: 'https://evil.example.com', code: 'c' }), 'browser-1', net.fetcher, 2_000)).rejects.toThrow('wrong server');
	await expect(finishConnect(oauth, new URLSearchParams({ state: await start(), iss: AS, code: 'other' }), 'browser-1', net.fetcher, 2_000)).rejects.toThrow('different account');
	const state = await start();
	await expect(finishConnect(oauth, new URLSearchParams({ state, iss: AS, code: 'c' }), 'browser-1', net.fetcher, 20 * 60_000)).rejects.toThrow('expired');
	// Used once, even when it failed.
	await expect(finishConnect(oauth, new URLSearchParams({ state, iss: AS, code: 'c' }), 'browser-1', net.fetcher, 2_000)).rejects.toThrow('expired');
	expect((await connectionStatus(oauth, false)).connected).toBe(false);
});

const post = { url: 'https://caseyagollan.com/2026/11/18/note', text: 'Hello', published: '2026-11-18T12:00:00Z', idempotencyKey: 'k' };

test('syndication posts with DPoP-bound OAuth tokens when connected', async () => {
	const { oauth, net } = await connected();
	const before = net.calls.length;
	const url = await syndicate('bluesky', post, { bluesky: { service: 'https://bsky.social', identifier: 'caseyagollan.com', password: 'app-password', oauth } }, net.fetcher);
	expect(url).toStartWith('https://bsky.app/profile/caseyagollan.com/post/');
	const sent = net.calls.slice(before);
	expect(sent.some(call => call.url.endsWith('createSession'))).toBe(false);
	const put = sent.filter(call => call.url === `${PDS}/xrpc/com.atproto.repo.putRecord`).at(-1)!;
	const headers = new Headers(put.init!.headers);
	expect(headers.get('authorization')).toBe('DPoP access-1');
	const proof = await verify(headers.get('dpop')!);
	expect(proof.ok).toBe(true);
	expect(proof.payload).toMatchObject({ htm: 'POST', htu: `${PDS}/xrpc/com.atproto.repo.putRecord`, nonce: 'pds-nonce', ath: await sha256('access-1') });
	expect(put.json).toMatchObject({ repo: DID, collection: 'app.bsky.feed.post' });
	expect((await connectionStatus(oauth, true)).lastPostAt).toBeNumber();
});

test('an expired access token is refreshed once and the new refresh token kept', async () => {
	const { store, oauth, net } = await connected({ expiresIn: 1 });
	await syndicate('bluesky', post, { bluesky: { service: 'https://bsky.social', oauth } }, net.fetcher);
	expect(net.refreshes()).toBe(1);
	const session = JSON.parse(store.files.get('private/bluesky-oauth/session.json')!.data);
	expect(session).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
	const put = net.calls.filter(call => call.url === `${PDS}/xrpc/com.atproto.repo.putRecord`).at(-1)!;
	expect(new Headers(put.init!.headers).get('authorization')).toBe('DPoP access-2');
});

test('a refused refresh marks the session for reconnecting and falls back to the app password', async () => {
	const { oauth, net } = await connected({ expiresIn: 1, refresh: 'invalid_grant' });
	const url = await syndicate('bluesky', post, { bluesky: { service: 'https://bsky.social', identifier: 'caseyagollan.com', password: 'app-password', oauth } }, net.fetcher);
	expect(url).toStartWith('https://bsky.app/profile/caseyagollan.com/post/');
	expect(net.calls.some(call => call.url.endsWith('createSession'))).toBe(true);
	const status = await connectionStatus(oauth, true);
	expect(status.connected).toBe(false);
	expect(status.broken?.reason).toContain('invalid_grant');
	expect(status.fallback?.reason).toContain('invalid_grant');
	// Without an app password the send stops with a clear reason.
	await expect(syndicate('bluesky', post, { bluesky: { service: 'https://bsky.social', oauth } }, net.fetcher)).rejects.toThrow('reconnecting');
});

test('a post OAuth is refused for is sent again with the app password, to the same record', async () => {
	const { oauth, net } = await connected({ putStatus: 403 });
	await syndicate('bluesky', post, { bluesky: { service: 'https://bsky.social', identifier: 'caseyagollan.com', password: 'app-password', oauth } }, net.fetcher);
	const puts = net.calls.filter(call => call.url.endsWith('/xrpc/com.atproto.repo.putRecord'));
	expect(new Headers(puts.at(-1)!.init!.headers).get('authorization')).toBe('Bearer password-jwt');
	expect(puts.at(-1)!.json!.rkey).toBe(puts[0].json!.rkey);
	expect((await connectionStatus(oauth, true)).fallback?.reason).toContain('403');
});

test('disconnecting revokes the refresh token and forgets the session', async () => {
	const { oauth, net } = await connected();
	await disconnect(oauth, net.fetcher);
	expect(net.calls.at(-1)!.form?.get('token')).toBe('refresh-1');
	expect((await connectionStatus(oauth, true)).connected).toBe(false);
});

test('publishing config offers OAuth with the app password as fallback', () => {
	const env = { PUBLISHING_ENABLED: 'true', PUBLISHING_ME: 'https://caseyagollan.com/', PUBLISHING_INTROSPECTION_ENDPOINT: 'https://x.example.com/', PUBLISHING_GITHUB_OWNER: 'o', PUBLISHING_GITHUB_REPO: 'r', PUBLISHING_GITHUB_BRANCH: 'main', PUBLISHING_GITHUB_TOKEN: 't', PUBLISHING_STATE: bucket() as unknown as R2Bucket, PUBLISHING_BLUESKY_IDENTIFIER: 'caseyagollan.com' };
	expect(publishingConfig(env)?.syndication?.bluesky).toMatchObject({ identifier: 'caseyagollan.com', oauth: { clientId: 'https://caseyagollan.com/oauth/bluesky/client-metadata.json' } });
	expect(publishingConfig({ ...env, PUBLISHING_BLUESKY_PASSWORD: 'p' })?.syndication?.bluesky?.password).toBe('p');
	expect(publishingConfig({ ...env, PUBLISHING_BLUESKY_OAUTH: 'false' })?.syndication?.bluesky).toBeUndefined();
	expect(publishingConfig({ ...env, PUBLISHING_STATE: undefined })?.syndication?.bluesky).toBeUndefined();
});
