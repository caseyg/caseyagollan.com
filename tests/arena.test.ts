import { describe, expect, test } from 'bun:test';
import { arenaDocument, arenaDocuments, fetchArena, isPublicOwn, type ArenaItem } from '../utils/arena';

const user = { slug: 'casey-gollan' };
const image: ArenaItem = {
	id: 2092617,
	type: 'Image',
	created_at: '2018-04-25T13:25:34Z',
	visibility: 'public',
	state: 'available',
	title: 'Light Phone 2',
	description: { plain: 'A phone with an E-ink display &amp; no apps.' },
	source: { url: 'https://www.indiegogo.com/x', provider: { name: 'www.indiegogo.com' } },
	image: { small: { src: 'https://images.are.na/small.jpg' }, src: 'https://d2w9rnfcy7mm78.cloudfront.net/original.jpg' },
	user
};
const channel: ArenaItem = { id: 1, type: 'Channel', slug: 'scrapism', title: 'Scrapism', updated_at: '2026-11-07T17:49:55Z', visibility: 'public', state: 'available', counts: { contents: 1 }, description: { plain: 'web scraping' }, owner: user };

function pages(...bodies: ArenaItem[][]) {
	const calls: string[] = [];
	const fetcher = async (url: string) => {
		calls.push(url);
		const n = Number(new URL(url).searchParams.get('page'));
		return Response.json({ data: bodies[n - 1] ?? [], meta: { has_more_pages: n < bodies.length } });
	};
	return { calls, fetcher };
}

describe('Are.na search documents', () => {
	test('a block opens on Are.na, with its picture and its site', () => {
		expect(arenaDocument(image)).toMatchObject({
			url: 'https://www.are.na/block/2092617',
			title: 'Light Phone 2',
			kind: 'image',
			detail: 'Image · indiegogo.com',
			image: 'https://images.are.na/small.jpg'
		});
		// Entities in Are.na's plain text are decoded once, then escaped once.
		expect(arenaDocument(image).html).toContain('E-ink display &amp; no apps.');
	});

	test('a channel opens at its address on Casey’s profile and says how big it is', () => {
		expect(arenaDocument(channel)).toMatchObject({ url: 'https://www.are.na/casey-gollan/scrapism', title: 'Scrapism', kind: 'channel', detail: 'Channel · 1 block' });
	});

	test('untitled blocks take a title from their source or text', () => {
		expect(arenaDocument({ id: 2, type: 'Link', source: { title: 'BERG', url: 'https://berglondon.com' }, user }).title).toBe('BERG');
		expect(arenaDocument({ id: 3, type: 'Text', content: { plain: 'x'.repeat(200) }, user }).title).toHaveLength(90);
	});

	test('only Casey’s own public items are indexed', () => {
		expect(isPublicOwn(image)).toBe(true);
		expect(isPublicOwn({ ...image, visibility: 'private' })).toBe(false);
		expect(isPublicOwn({ ...channel, visibility: 'closed' })).toBe(false);
		expect(isPublicOwn({ ...channel, owner: { slug: 'someone-else' } })).toBe(false);
		expect(isPublicOwn({ ...image, state: 'processing' })).toBe(false);
	});

	test('fetches every page of the profile', async () => {
		const { calls, fetcher } = pages([channel], [image, { ...image, id: 9, visibility: 'private' }]);
		const documents = await arenaDocuments({ fetcher, token: undefined });
		expect(calls).toHaveLength(2);
		expect(calls[0]).toBe('https://api.are.na/v3/users/casey-gollan/contents?per=100&page=1');
		expect(documents.map((document) => document.url)).toEqual(['https://www.are.na/casey-gollan/scrapism', 'https://www.are.na/block/2092617']);
	});

	test('waits out a rate limit and retries server errors, then fails rather than index part of it', async () => {
		let n = 0;
		const flaky = async () => (++n === 1 ? new Response('', { status: 429, headers: { 'x-ratelimit-reset': '0' } }) : n === 2 ? new Response('', { status: 503 }) : Response.json({ data: [image], meta: {} }));
		expect(await fetchArena({ fetcher: flaky, token: undefined, retryDelayMs: 1 })).toHaveLength(1);
		const down = async () => new Response('', { status: 502 });
		await expect(fetchArena({ fetcher: down, token: undefined, retryDelayMs: 1, attempts: 2 })).rejects.toThrow('Are.na: 502');
		let tries = 0;
		const missing = async () => (tries++, new Response('', { status: 404 }));
		await expect(fetchArena({ fetcher: missing, token: undefined, retryDelayMs: 1 })).rejects.toThrow('Are.na: 404');
		expect(tries).toBe(1);
	});

	test('sends a token when the build has one', async () => {
		let auth: string | null = null;
		const fetcher = async (_url: string, init?: RequestInit) => ((auth = new Headers(init?.headers).get('authorization')), Response.json({ data: [], meta: {} }));
		await fetchArena({ fetcher, token: 'abc' });
		expect(auth).toBe('Bearer abc');
	});
});
