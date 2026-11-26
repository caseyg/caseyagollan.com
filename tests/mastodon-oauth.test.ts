import { expect, test } from 'bun:test';
import { connectionStatus, disconnect, finishConnect, instanceOrigin, mastodonCredentials, mastodonOAuthConfig, startConnect, MASTODON_SCOPE } from '../src/lib/server/publishing/mastodon-oauth';
import { sha256 } from '../src/lib/server/publishing/dpop';
import { syndicate } from '../src/lib/server/publishing/syndication';
import { publishingConfig } from '../src/lib/server/publishing/config';

const INSTANCE = 'https://social.example.com';

function bucket() {
	const files = new Map<string, { etag: string; data: string }>();
	let version = 0;
	return {
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
}

/** One Mastodon instance: app registration, the token endpoint, and the API. */
function network(options: { scope?: string; oauthStatus?: number; tokenError?: string } = {}) {
	const calls: { url: string; init?: RequestInit; form?: URLSearchParams; json?: Record<string, unknown> }[] = [];
	const revoked: string[] = [];
	let apps = 0, tokens = 0;
	const fetcher = async (url: string, init: RequestInit = {}) => {
		const form = init.body instanceof URLSearchParams ? init.body : undefined;
		const json = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
		calls.push({ url, init, form, json });
		const bearer = new Headers(init.headers).get('authorization')?.replace(/^Bearer /, '');
		if (url === `${INSTANCE}/api/v1/apps`) { apps++; return Response.json({ client_id: `client-${apps}`, client_secret: `secret-${apps}` }); }
		if (url === `${INSTANCE}/oauth/token`) {
			if (options.tokenError) return Response.json({ error: options.tokenError }, { status: 401 });
			return Response.json({ access_token: `oauth-${++tokens}`, token_type: 'Bearer', scope: options.scope ?? MASTODON_SCOPE, created_at: 1 });
		}
		if (url === `${INSTANCE}/oauth/revoke`) { revoked.push(form!.get('token')!); return Response.json({}); }
		if (url === `${INSTANCE}/api/v1/accounts/verify_credentials`) return Response.json({ id: '42', username: 'casey', url: `${INSTANCE}/@casey` });
		if (url === `${INSTANCE}/api/v1/statuses`) {
			if (bearer?.startsWith('oauth-') && options.oauthStatus) return Response.json({ error: 'The access token was revoked' }, { status: options.oauthStatus });
			return Response.json({ id: '900', url: `${INSTANCE}/@casey/900` });
		}
		throw new Error('Unexpected fetch ' + url);
	};
	return { fetcher, calls, revoked, apps: () => apps };
}

const config = (store: ReturnType<typeof bucket>) => mastodonOAuthConfig('https://caseyagollan.com/', store as unknown as R2Bucket, INSTANCE)!;

async function connected(options: Parameters<typeof network>[0] = {}) {
	const store = bucket(), oauth = config(store), net = network(options);
	const page = new URL(await startConnect(oauth, 'browser-1', net.fetcher));
	await finishConnect(oauth, new URLSearchParams({ state: page.searchParams.get('state')!, code: 'code-1' }), 'browser-1', net.fetcher);
	return { store, oauth, net, page };
}

const post = { url: 'https://caseyagollan.com/2026/11/26/hello/', text: 'Hello', published: '2026-11-26T12:00:00Z', idempotencyKey: 'key-1' };

test('an instance must be a public HTTPS hostname, with nothing after it', () => {
	expect(instanceOrigin('social.coop')).toBe('https://social.coop');
	expect(instanceOrigin(' https://Social.Coop/ ')).toBe('https://social.coop');
	for (const value of ['', 'localhost', 'http://social.coop', 'https://127.0.0.1', 'https://2130706433', 'https://[::1]', 'https://10.0.0.5', 'https://169.254.169.254', 'https://social.coop:8443', 'https://user:pass@social.coop', 'https://box.internal', 'https://printer.local', 'https://social.coop/admin', 'https://social.coop/?next=1', 'x'.repeat(301)])
		expect(instanceOrigin(value)).toBeUndefined();
	const store = bucket() as unknown as R2Bucket;
	expect(mastodonOAuthConfig('https://caseyagollan.com/', store, 'https://192.168.1.10')).toBeUndefined();
	expect(mastodonOAuthConfig('http://localhost:5173/', store, INSTANCE)).toBeUndefined();
	expect(mastodonOAuthConfig('https://caseyagollan.com/', undefined, INSTANCE)).toBeUndefined();
});

test('connecting registers the app once, sends a PKCE request, and stores who approved', async () => {
	const { store, oauth, net, page } = await connected();
	expect(page.origin + page.pathname).toBe(`${INSTANCE}/oauth/authorize`);
	expect(Object.fromEntries(page.searchParams)).toMatchObject({ response_type: 'code', client_id: 'client-1', redirect_uri: 'https://caseyagollan.com/oauth/mastodon/callback', scope: MASTODON_SCOPE, code_challenge_method: 'S256' });
	const app = net.calls.find(call => call.url.endsWith('/api/v1/apps'))!.json!;
	expect(app).toMatchObject({ client_name: 'caseyagollan.com', redirect_uris: 'https://caseyagollan.com/oauth/mastodon/callback', scopes: MASTODON_SCOPE, website: 'https://caseyagollan.com' });
	const token = net.calls.find(call => call.url.endsWith('/oauth/token'))!.form!;
	expect(token.get('client_secret')).toBe('secret-1');
	expect(await sha256(token.get('code_verifier')!)).toBe(page.searchParams.get('code_challenge')!);
	const status = await connectionStatus(oauth, true);
	expect(status).toMatchObject({ connected: true, instance: 'social.example.com', account: 'casey@social.example.com', accountUrl: `${INSTANCE}/@casey`, tokenFallback: true });
	// Nothing secret reaches the account page.
	expect(JSON.stringify(status)).not.toMatch(/oauth-1|secret-1/);
	expect([...store.files.keys()].some(key => key.includes('/pending/'))).toBe(false);
	// A second connect reuses the registered app, and the earlier token is revoked.
	const again = new URL(await startConnect(oauth, 'browser-1', net.fetcher));
	await finishConnect(oauth, new URLSearchParams({ state: again.searchParams.get('state')!, code: 'code-2' }), 'browser-1', net.fetcher);
	expect(net.apps()).toBe(1);
	expect(net.revoked).toEqual(['oauth-1']);
});

test('a sign-in only finishes once, in the browser that started it, within ten minutes', async () => {
	const store = bucket(), oauth = config(store), net = network();
	const start = async () => new URL(await startConnect(oauth, 'browser-1', net.fetcher, 1_000)).searchParams.get('state')!;
	await expect(finishConnect(oauth, new URLSearchParams({ state: await start(), code: 'c' }), 'browser-2', net.fetcher, 2_000)).rejects.toThrow('browser');
	await expect(finishConnect(oauth, new URLSearchParams({ state: await start(), code: 'c' }), undefined, net.fetcher, 2_000)).rejects.toThrow('browser');
	await expect(finishConnect(oauth, new URLSearchParams({ state: await start(), error: 'access_denied' }), 'browser-1', net.fetcher, 2_000)).rejects.toThrow('not allowed');
	await expect(finishConnect(oauth, new URLSearchParams({ state: 'made-up', code: 'c' }), 'browser-1', net.fetcher, 2_000)).rejects.toThrow('expired');
	const state = await start();
	await expect(finishConnect(oauth, new URLSearchParams({ state, code: 'c' }), 'browser-1', net.fetcher, 20 * 60_000)).rejects.toThrow('expired');
	// Used once, even when it failed.
	await expect(finishConnect(oauth, new URLSearchParams({ state, code: 'c' }), 'browser-1', net.fetcher, 2_000)).rejects.toThrow('expired');
	expect((await connectionStatus(oauth, false)).connected).toBe(false);
	expect(net.calls.some(call => call.url.endsWith('/oauth/token'))).toBe(false);
});

test('a grant that cannot post is revoked, and a forgotten app is registered afresh', async () => {
	const store = bucket(), oauth = config(store), readOnly = network({ scope: 'read:accounts' });
	const page = new URL(await startConnect(oauth, 'b', readOnly.fetcher));
	await expect(finishConnect(oauth, new URLSearchParams({ state: page.searchParams.get('state')!, code: 'c' }), 'b', readOnly.fetcher)).rejects.toThrow('did not allow posting');
	expect(readOnly.revoked).toEqual(['oauth-1']);
	expect((await connectionStatus(oauth, false)).connected).toBe(false);

	const forgotten = network({ tokenError: 'invalid_client' });
	const next = new URL(await startConnect(oauth, 'b', forgotten.fetcher));
	expect(forgotten.apps()).toBe(0);
	await expect(finishConnect(oauth, new URLSearchParams({ state: next.searchParams.get('state')!, code: 'c' }), 'b', forgotten.fetcher)).rejects.toThrow('invalid_client');
	await startConnect(oauth, 'b', forgotten.fetcher);
	expect(forgotten.apps()).toBe(1);
});

test('posts go out with the OAuth token once connected, and the account page shows it', async () => {
	const { oauth, net } = await connected();
	const url = await syndicate('mastodon', post, { mastodon: { instance: INSTANCE, token: 'static', oauth } }, net.fetcher);
	expect(url).toBe(`${INSTANCE}/@casey/900`);
	expect(new Headers(net.calls.at(-1)!.init!.headers).get('authorization')).toBe('Bearer oauth-1');
	expect((await connectionStatus(oauth, true)).lastPostAt).toBeGreaterThan(0);
});

test('a revoked OAuth token falls back to the static token and asks for a reconnect', async () => {
	const { oauth, net } = await connected({ oauthStatus: 401 });
	const account = { instance: INSTANCE, token: 'static', oauth };
	expect(await syndicate('mastodon', post, { mastodon: account }, net.fetcher)).toBe(`${INSTANCE}/@casey/900`);
	const sends = net.calls.filter(call => call.url.endsWith('/api/v1/statuses'));
	expect(sends.map(call => new Headers(call.init!.headers).get('authorization'))).toEqual(['Bearer oauth-1', 'Bearer static']);
	// The same idempotency key both times, so the instance cannot post it twice.
	expect(new Set(sends.map(call => new Headers(call.init!.headers).get('idempotency-key'))).size).toBe(1);
	const status = await connectionStatus(oauth, true);
	expect(status.connected).toBe(false);
	expect(status.broken?.reason).toContain('401');
	expect(status.fallback?.reason).toContain('401');
	// From then on the static token is used straight away.
	expect(await mastodonCredentials(account)).toMatchObject({ token: 'static', auth: 'token' });
});

test('without a static token, a refused connection stops the send with a reason', async () => {
	const { oauth, net } = await connected({ oauthStatus: 403 });
	await expect(syndicate('mastodon', post, { mastodon: { instance: INSTANCE, oauth } }, net.fetcher)).rejects.toThrow('Mastodon needs reconnecting');
	// A 403 can be about one post, so the connection itself is kept.
	expect((await connectionStatus(oauth, false)).connected).toBe(true);
	await expect(mastodonCredentials({ instance: INSTANCE })).rejects.toThrow('not connected');
});

test('disconnecting revokes the token and forgets the session', async () => {
	const { store, oauth, net } = await connected();
	await disconnect(oauth, net.fetcher);
	expect(net.revoked).toEqual(['oauth-1']);
	expect(await connectionStatus(oauth, true)).toMatchObject({ connected: false, tokenFallback: true });
	expect([...store.files.keys()].filter(key => key.endsWith('session.json'))).toEqual([]);
	expect(await mastodonCredentials({ instance: INSTANCE, token: 'static', oauth })).toMatchObject({ token: 'static', auth: 'token' });
});

test('a session for another instance is ignored', async () => {
	const { store } = await connected();
	const moved = mastodonOAuthConfig('https://caseyagollan.com/', store as unknown as R2Bucket, 'https://other.example.org')!;
	expect((await connectionStatus(moved, false)).connected).toBe(false);
	await expect(mastodonCredentials({ instance: moved.instance, oauth: moved })).rejects.toThrow('not connected');
});

test('publishing config offers Mastodon with OAuth, the static token, or both', () => {
	const base = { PUBLISHING_ENABLED: 'true', PUBLISHING_ME: 'https://caseyagollan.com/', PUBLISHING_INTROSPECTION_ENDPOINT: 'https://auth.example.com/introspect', PUBLISHING_GITHUB_OWNER: 'o', PUBLISHING_GITHUB_REPO: 'r', PUBLISHING_GITHUB_BRANCH: 'main', PUBLISHING_GITHUB_TOKEN: 't' };
	const store = bucket() as unknown as R2Bucket;
	const mastodon = (env: Record<string, unknown>) => publishingConfig({ ...base, ...env } as never)?.syndication?.mastodon;
	expect(mastodon({})).toBeUndefined();
	expect(mastodon({ PUBLISHING_MASTODON_TOKEN: 'static' })).toEqual({ instance: 'https://social.coop', token: 'static' });
	expect(mastodon({ PUBLISHING_STATE: store, PUBLISHING_MASTODON_INSTANCE: INSTANCE })).toMatchObject({ instance: INSTANCE, oauth: { redirectUri: 'https://caseyagollan.com/oauth/mastodon/callback' } });
	expect(mastodon({ PUBLISHING_STATE: store, PUBLISHING_MASTODON_INSTANCE: INSTANCE, PUBLISHING_MASTODON_TOKEN: 'static', PUBLISHING_MASTODON_OAUTH: 'false' })).toEqual({ instance: INSTANCE, token: 'static' });
	expect(mastodon({ PUBLISHING_STATE: store, PUBLISHING_MASTODON_INSTANCE: 'https://10.0.0.1' })).toBeUndefined();
});
