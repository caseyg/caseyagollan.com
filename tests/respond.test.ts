import { describe, expect, test } from 'bun:test';
import { mastodonInteractUrl, normalizeServer, postCopies, sendWebmention, webmentionSourceError } from '../src/lib/respond';

describe('postCopies', () => {
	test('takes the first copy per network, as a thread lists every post', () => {
		expect(postCopies([
			'https://bsky.app/profile/caseyagollan.com/post/aaa',
			'https://bsky.app/profile/caseyagollan.com/post/bbb',
			'https://social.coop/@caseyg/1',
			'https://social.coop/@caseyg/2',
			'https://example.com/elsewhere'
		])).toEqual({ bluesky: 'https://bsky.app/profile/caseyagollan.com/post/aaa', mastodon: 'https://social.coop/@caseyg/1' });
	});
	test('ignores profiles and junk', () => {
		expect(postCopies(['https://bsky.app/profile/caseyagollan.com', 'not a url', 'https://social.coop/@caseyg'])).toEqual({});
	});
});

describe('normalizeServer', () => {
	test('accepts hostnames, addresses and handles', () => {
		for (const input of ['mastodon.social', 'https://mastodon.social/', ' Mastodon.Social ', '@me@mastodon.social', 'me@mastodon.social', 'mastodon.social/@me'])
			expect(normalizeServer(input)).toBe('mastodon.social');
	});
	test('rejects what cannot be a server', () => {
		for (const input of ['', 'mastodon', 'not a server', 'javascript:alert(1)', '@me']) expect(normalizeServer(input)).toBeUndefined();
	});
});

test('mastodonInteractUrl asks the visitor’s server, or opens the post on its own', () => {
	const status = 'https://social.coop/@caseyg/115278138445265088';
	expect(mastodonInteractUrl('mastodon.social', status)).toBe('https://mastodon.social/authorize_interaction?uri=https%3A%2F%2Fsocial.coop%2F%40caseyg%2F115278138445265088');
	expect(mastodonInteractUrl('social.coop', status)).toBe(status);
});

describe('sendWebmention', () => {
	const target = 'https://caseyagollan.com/2025/09/27/6c526/';
	test('checks the source first', () => {
		expect(webmentionSourceError('example.com/post', target)).toBeString();
		expect(webmentionSourceError(target, target)).toContain('this post');
		expect(webmentionSourceError('https://example.com/post', target)).toBeUndefined();
	});
	test('posts source and target as a form', async () => {
		let body = '';
		const outcome = await sendWebmention('https://example.com/post', target, 'https://wm.test/endpoint', (async (_url: string, init: RequestInit) => {
			body = String(init.body);
			return new Response('{}', { status: 201 });
		}) as unknown as typeof fetch);
		expect(outcome).toEqual({ ok: true, status: 'queued' });
		expect(new URLSearchParams(body).get('target')).toBe(target);
	});
	test('passes on what the endpoint said', async () => {
		const outcome = await sendWebmention('https://example.com/post', target, 'https://wm.test/endpoint', (async () => Response.json({ error: 'no_link_found', error_description: 'no link found' }, { status: 400 })) as unknown as typeof fetch);
		expect(outcome).toMatchObject({ ok: false, status: 'invalid', message: 'Webmention.io said: no link found' });
	});
});
