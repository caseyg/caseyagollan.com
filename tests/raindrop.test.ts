import { describe, expect, test } from 'bun:test';
import { raindropBlock, searchRaindrop } from '../src/lib/server/raindrop';
import { withOwnerSources } from '../src/lib/table-sources';
import type { Block } from '../src/lib/tables';

describe('Raindrop bookmarks for the owner', () => {
	test('a bookmark opens its page and says where it came from', () => {
		expect(raindropBlock({ _id: 1, title: ' New avenues ', link: 'https://www.robinsloan.com/lab/', domain: 'robinsloan.com', created: '2026-10-02T12:00:00Z', excerpt: 'Small software', note: 'reread', cover: 'https://rdl.ink/c.jpg', type: 'article' })).toEqual({
			kind: 'raindrop',
			url: 'https://www.robinsloan.com/lab/',
			title: 'New avenues',
			meta: 'Raindrop · robinsloan.com · 2026-10-02',
			excerpt: 'Small software · reread',
			image: 'https://rdl.ink/c.jpg',
			icon: '📄',
			ref: 'raindrop:1'
		});
		expect(raindropBlock({ _id: 2, link: 'https://www.example.com/x', cover: 'http://insecure/c.jpg' })).toMatchObject({ title: 'example.com', image: undefined, icon: '💧' });
		expect(raindropBlock({ _id: 3, link: 'javascript:alert(1)' })).toBeNull();
	});

	test('searches every collection with the token, newest first when there is no query', async () => {
		const calls: { url: string; auth: string | null }[] = [];
		const fetcher = (async (url: string, init?: RequestInit) => {
			calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
			return Response.json({ items: [{ _id: 1, title: 'A', link: 'https://a.example/' }] });
		}) as unknown as typeof fetch;
		expect(await searchRaindrop('tok', 'small web', 10, fetcher)).toHaveLength(1);
		await searchRaindrop('tok', '', 10, fetcher);
		expect(calls[0].auth).toBe('Bearer tok');
		expect(calls[0].url).toBe('https://api.raindrop.io/rest/v1/raindrops/0?perpage=10&page=0&sort=score&search=small+web');
		expect(calls[1].url).toBe('https://api.raindrop.io/rest/v1/raindrops/0?perpage=10&page=0&sort=-created');
	});

	test('a Raindrop error is an error, not an empty result', async () => {
		const fetcher = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
		await expect(searchRaindrop('bad', 'x', 10, fetcher)).rejects.toThrow('Raindrop: 401');
	});
});

describe('the owner’s Add menu sources', () => {
	const block = (kind: Block['kind'], title: string): Block => ({ kind, url: `https://${title}.example/`, title });
	const site = async () => [block('post', 'site')];
	const sources = { arena: async () => [block('arena', 'arena')], raindrop: async () => [block('raindrop', 'raindrop')] };

	test('the Raindrop filter shows only bookmarks', async () => {
		expect((await withOwnerSources(site, sources)('', 'raindrop'))?.map((b) => b.title)).toEqual(['raindrop']);
	});

	test('a search of everything adds private Are.na and Raindrop after the site', async () => {
		expect((await withOwnerSources(site, sources)('web', 'all'))?.map((b) => b.title)).toEqual(['site', 'arena', 'raindrop']);
		expect((await withOwnerSources(site, sources)('web', 'book'))?.map((b) => b.title)).toEqual(['site']);
	});
});
