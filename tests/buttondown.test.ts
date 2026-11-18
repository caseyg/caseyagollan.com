import { describe, expect, test } from 'bun:test';
import { looksLikeEmail, subscribe } from '../src/lib/server/buttondown';

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
		expect(JSON.parse(String(seen?.body))).toEqual({ email_address: 'a@b.co', ip_address: '1.2.3.4' });
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
});
