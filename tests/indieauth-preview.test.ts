import { describe, expect, test } from 'bun:test';
import { authSettings, withPreviewOrigin, type AuthRPC, type IndieAuthEnvironment } from '../src/lib/server/indieauth/contracts';
import { IndieAuthState, type StateStorage } from '../src/lib/server/indieauth/state';
import { createIndieAuthHandler } from '../src/lib/server/indieauth/protocol';
import { PREVIEW_STATE_COOKIE, finishPreviewSignIn, startPreviewSignIn } from '../src/lib/server/indieauth/preview';

const preview = 'https://branch-caseyagollan.caseygollan.workers.dev';
const issuer = 'https://caseyagollan.com/';
const baseEnv = { AUTH_ENABLED: 'true', AUTH_ME: issuer, AUTH_PREVIEW_ISSUER: issuer, AUTH_SETUP_TOKEN: 'setup', AUTH_STORE: {} as DurableObjectNamespace } satisfies IndieAuthEnvironment;

class MemoryStorage implements StateStorage {
	data = new Map<string, unknown>();
	async get<T>(key: string) { return structuredClone(this.data.get(key)) as T; }
	async put(key: string, value: unknown) { this.data.set(key, structuredClone(value)); }
	async transaction<T>(fn: (s: StateStorage) => Promise<T>): Promise<T> { return fn(this); }
}

describe('preview settings', () => {
	test('the Worker binds sign-in to the host each request came in on', () => {
		const env = withPreviewOrigin(baseEnv, new Request(preview + '/chat'));
		const settings = authSettings(env)!;
		expect(settings.issuer).toBe(preview + '/');
		expect(settings.previewIssuer).toBe(issuer);
		expect(settings.setupToken).toBeUndefined();
	});
	test('production settings are unchanged', () => {
		const env = { AUTH_ENABLED: 'true', AUTH_ORIGIN: issuer, AUTH_ME: issuer, AUTH_STORE: {} as DurableObjectNamespace };
		expect(withPreviewOrigin(env, new Request(preview + '/'))).toBe(env);
		expect(authSettings(env)!.previewIssuer).toBeUndefined();
	});
	test('the Durable Object gets settings without a request', () => {
		expect(authSettings(baseEnv)?.previewIssuer).toBe(issuer);
		expect(authSettings({ ...baseEnv, AUTH_PREVIEW_ISSUER: 'http://caseyagollan.com/' })).toBeUndefined();
	});
});

describe('preview store', () => {
	const settings = authSettings(baseEnv)!;
	test('starts a session only for the owner the issuer vouched for', async () => {
		const state = new IndieAuthState(new MemoryStorage(), settings);
		await expect(state.invoke('previewSession', { me: 'https://someone.example/' })).rejects.toThrow('access_denied');
		const session = await state.invoke('previewSession', { me: issuer });
		expect(await state.invoke('session', { token: session.sessionToken })).toEqual({ csrf: session.csrf, expiresAt: session.expiresAt });
		// A later operation's cleanup keeps the session although no passkey backs it.
		await state.invoke('status', {});
		expect(await state.invoke('session', { token: session.sessionToken })).not.toBeNull();
	});
	test('never holds passkeys or issues tokens', async () => {
		const state = new IndieAuthState(new MemoryStorage(), settings);
		await expect(state.invoke('authenticationOptions', { origin: preview })).rejects.toThrow('access_denied');
		await expect(state.invoke('registrationOptions', { authorization: { setupToken: 'setup' }, origin: preview })).rejects.toThrow('access_denied');
		await expect(state.invoke('createRequest', { clientId: 'https://x.example/', redirectUri: 'https://x.example/cb', scope: [], codeChallenge: 'a'.repeat(43) })).rejects.toThrow('access_denied');
		expect(await state.invoke('status', {})).toEqual({ credentialCount: 0, setupAvailable: false });
	});
	test('production refuses preview sessions', async () => {
		const state = new IndieAuthState(new MemoryStorage(), { ...settings, previewIssuer: undefined });
		await expect(state.invoke('previewSession', { me: issuer })).rejects.toThrow('access_denied');
	});
});

function fakeStore(calls: { op: string; input: unknown }[] = []): AuthRPC {
	return { invoke: async (op: string, input: unknown) => {
		calls.push({ op, input });
		if (op === 'rateLimit') return true;
		if (op === 'status') return { credentialCount: 0, setupAvailable: false };
		if (op === 'session') return null;
		if (op === 'previewSession') return { sessionToken: 'preview-session', csrf: 'c', expiresAt: Date.now() + 60_000 };
		return true;
	} } as AuthRPC;
}

async function started(returnTo = '/chat') {
	const settings = authSettings(withPreviewOrigin(baseEnv, new Request(preview)))!;
	const response = await startPreviewSignIn(new Request(`${preview}/auth/preview?returnTo=${encodeURIComponent(returnTo)}`), settings);
	const location = new URL(response.headers.get('location')!);
	const cookie = response.headers.get('set-cookie')!.split(';')[0];
	return { settings, response, location, cookie };
}

describe('preview sign-in flow', () => {
	test('sends the browser to production as an identity-only IndieAuth client', async () => {
		const { response, location, cookie } = await started();
		expect(response.status).toBe(303);
		expect(location.origin + location.pathname).toBe(issuer + 'auth');
		expect(location.searchParams.get('client_id')).toBe(preview + '/');
		expect(location.searchParams.get('redirect_uri')).toBe(preview + '/auth/preview/callback');
		expect(location.searchParams.get('code_challenge_method')).toBe('S256');
		expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(location.searchParams.get('me')).toBe(issuer);
		expect(location.searchParams.has('scope')).toBe(false);
		expect(cookie.startsWith(PREVIEW_STATE_COOKIE + '=')).toBe(true);
		expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
	});

	test('redeems the code with PKCE and starts the preview session', async () => {
		const { settings, location, cookie } = await started('/chat');
		const state = location.searchParams.get('state')!;
		let sent: URLSearchParams | undefined;
		const calls: { op: string; input: unknown }[] = [];
		const response = await finishPreviewSignIn(
			new Request(`${preview}/auth/preview/callback?code=abc&state=${state}&iss=${encodeURIComponent(issuer)}`, { headers: { cookie } }),
			settings, fakeStore(calls),
			async (url, init) => {
				expect(url).toBe(issuer + 'auth');
				sent = new URLSearchParams(String(init.body));
				return Response.json({ me: issuer });
			}
		);
		expect(sent?.get('code')).toBe('abc');
		expect(sent?.get('client_id')).toBe(preview + '/');
		const verifier = cookie.split('=')[1].split('.')[1];
		expect(sent?.get('code_verifier')).toBe(verifier);
		expect(calls).toEqual([{ op: 'previewSession', input: { me: issuer } }]);
		expect(response.headers.get('location')).toBe(`${preview}/account?returnTo=%2Fchat`);
		const cookies = response.headers.getSetCookie();
		expect(cookies.some((c) => c.startsWith('__Host-indieauth-session=preview-session;'))).toBe(true);
		expect(cookies.some((c) => c.startsWith(`${PREVIEW_STATE_COOKIE}=;`))).toBe(true);
	});

	test('fails without a session for a wrong state, issuer or identity', async () => {
		const { settings, location, cookie } = await started();
		const state = location.searchParams.get('state')!;
		const cases: [string, string, unknown][] = [
			['other-state', issuer, issuer],
			[state, 'https://evil.example/', issuer],
			[state, issuer, 'https://someone.example/']
		];
		for (const [s, iss, me] of cases) {
			const calls: { op: string; input: unknown }[] = [];
			const response = await finishPreviewSignIn(
				new Request(`${preview}/auth/preview/callback?code=abc&state=${s}&iss=${encodeURIComponent(iss)}`, { headers: { cookie } }),
				settings, fakeStore(calls), async () => Response.json({ me })
			);
			expect(response.headers.get('location')).toBe(`${preview}/account?signin=failed`);
			expect(calls).toEqual([]);
		}
	});

	test('the preview serves only owner-session routes', async () => {
		const handler = createIndieAuthHandler(withPreviewOrigin(baseEnv, new Request(preview)), { store: fakeStore() });
		const session = await handler(new Request(preview + '/auth/session'));
		expect(await session.json()).toEqual({ authenticated: false, credentialCount: 0, setupAvailable: false, signInWith: issuer });
		expect((await handler(new Request(preview + '/auth/preview?returnTo=/chat'))).status).toBe(303);
		for (const path of ['/auth?response_type=code', '/.well-known/oauth-authorization-server'])
			expect((await handler(new Request(preview + path))).status).toBe(404);
		const passkey = await handler(new Request(preview + '/auth/passkey/login/options', { method: 'POST', headers: { origin: preview, 'content-type': 'application/json' }, body: '{}' }));
		expect(passkey.status).toBe(404);
	});
});
