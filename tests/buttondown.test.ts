import { describe, expect, test } from 'bun:test';
import { applyNewsletterTheme, looksLikeEmail, subscribe } from '../src/lib/server/buttondown';

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('Buttondown signup', () => {
	test('checks addresses loosely', () => {
		expect(looksLikeEmail('a@b.co')).toBe(true);
		expect(looksLikeEmail('nope')).toBe(false);
		expect(looksLikeEmail('a b@c.d')).toBe(false);
	});

	test('rejects a bad address before calling Buttondown', async () => {
		let called = false;
		const result = await subscribe('key', 'nope', {}, (async () => ((called = true), new Response())) as unknown as typeof fetch);
		expect(result).toMatchObject({ ok: false, status: 'invalid' });
		expect(called).toBe(false);
	});

	test('says so when the key is not set', async () => {
		expect(await subscribe(undefined, 'a@b.co')).toMatchObject({ ok: false, status: 'unavailable' });
	});

	test('sends the key only in the Authorization header', async () => {
		let seen: RequestInit | undefined;
		const fetcher = (async (_url: string, init: RequestInit) => ((seen = init), new Response('{}', { status: 201 }))) as unknown as typeof fetch;
		expect(await subscribe('secret', 'a@b.co', { ip: '1.2.3.4' }, fetcher)).toEqual({ ok: true, status: 'subscribed' });
		expect((seen?.headers as Record<string, string>).Authorization).toBe('Token secret');
		expect(JSON.parse(String(seen?.body))).toEqual({ email_address: 'a@b.co', type: 'unactivated', ip_address: '1.2.3.4' });
	});

	test('treats an existing subscriber as success', async () => {
		expect(await subscribe('k', 'a@b.co', {}, reply(400, { code: 'email_already_exists' }))).toEqual({ ok: true, status: 'already' });
	});

	test('does not resubscribe a suppressed address', async () => {
		expect(await subscribe('k', 'a@b.co', {}, reply(400, { code: 'subscriber_suppressed' }))).toMatchObject({ ok: false, status: 'failed' });
	});

	test('hides Buttondown errors behind a plain message', async () => {
		const result = await subscribe('k', 'a@b.co', {}, reply(500, { detail: 'internal' }));
		expect(result).toMatchObject({ ok: false, status: 'failed' });
		expect(JSON.stringify(result)).not.toContain('internal');
	});

	test('applies the settings one at a time and reports the ones Buttondown refuses', async () => {
		const sent: string[] = [];
		const fetcher = (async (url: string, init: RequestInit = {}) => {
			if (!init.method) return new Response(JSON.stringify({ results: [{ id: 'n1', username: 'casey', api_key: 'secret' }] }));
			const body = JSON.parse(String(init.body)) as Record<string, unknown>;
			sent.push(Object.keys(body)[0]);
			if ('web_css' in body) return new Response(JSON.stringify({ code: 'web_css__not_allowed', detail: 'Your current plan doesn’t allow for customizing CSS.' }), { status: 400 });
			return new Response(JSON.stringify({ id: 'n1', username: 'casey', api_key: 'secret', tint_color: '#0000ff', theme_configuration: { a: 'b' } }));
		}) as unknown as typeof fetch;
		const result = await applyNewsletterTheme('k', { web_css: 'x', tint_color: '#0000ff', theme_configuration: { a: 'b' } }, fetcher);
		// The reply to the tint already has the variables, so they aren't sent again.
		expect(sent).toEqual(['web_css', 'tint_color']);
		expect(result.applied).toEqual({ web_css: false, tint_color: true, theme_configuration: true });
		expect(result.refused).toEqual({ web_css: 'Your current plan doesn’t allow for customizing CSS.' });
		expect(JSON.stringify(result)).not.toContain('secret');
	});
});
