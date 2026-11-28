import { describe, expect, test } from 'bun:test';
import { groupByDay, isPicture, localDay, rangeStart, recentFeed, recentSaves, similarBlocks, sortFeed, timeLabel, type FeedItem } from '../src/lib/table-feed';
import type { Block } from '../src/lib/tables';

const NY = 'America/New_York';
const now = new Date('2026-11-28T20:30:00Z'); // 3:30 pm in New York
const item = (url: string, at: string, source: FeedItem['source'] = 'post'): FeedItem => ({ at, source, block: { kind: source === 'post' ? 'post' : 'link', url, title: url } });

describe('the feed groups by the reader’s days', () => {
	test('a group for each day, newest first, each day newest first', () => {
		const days = groupByDay([
			item('/a', '2026-11-28T14:00:00Z'), item('/c', '2026-11-27T23:00:00Z', 'arena'), item('/b', '2026-11-28T19:00:00Z', 'readwise'),
			// 03:30 UTC on the 28th is still the evening of the 27th in New York.
			item('/d', '2026-11-28T03:30:00Z', 'raindrop'), item('/e', '2026-11-24T12:00:00Z')
		], now, NY);
		expect(days.map((day) => [day.day, day.label, day.items.map((one) => one.block.url)])).toEqual([
			['2026-11-28', 'Today', ['/b', '/a']],
			['2026-11-27', 'Yesterday', ['/d', '/c']],
			['2026-11-24', 'Tuesday, Nov 24', ['/e']]
		]);
	});

	test('the same thing is listed once, and things without a time are left out', () => {
		expect(sortFeed([item('/a', '2026-11-28T14:00:00Z'), item('/a', '2026-11-27T14:00:00Z'), item('/b', 'someday')]).map((one) => one.at)).toEqual(['2026-11-28T14:00:00Z']);
	});

	test('a range starts at the beginning of its first day, so that day is whole', () => {
		const start = rangeStart(7, now, NY);
		expect(start.toISOString().slice(0, 16)).toBe('2026-11-21T05:00');
		expect(localDay(start, NY)).toBe('2026-11-21');
		expect(localDay(new Date(start.getTime() - 2000), NY)).toBe('2026-11-20');
	});

	test('times read as the reader’s clock', () => {
		expect(timeLabel('2026-11-28T20:05:00Z', NY)).toBe('3:05 pm');
	});
});

describe('reading the feed', () => {
	const answer = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

	test('saves are read a page at a time until all are in', async () => {
		const asked: string[] = [];
		const all = Array.from({ length: 130 }, (_, at) => item(`https://example.com/${at}`, '2026-11-25T10:00:00Z', 'raindrop'));
		const fetcher = (async (url: string) => {
			asked.push(url);
			const offset = Number(new URL(url, 'https://x.test').searchParams.get('offset'));
			return answer({ total: all.length, items: all.slice(offset, offset + 100) });
		}) as unknown as typeof fetch;
		expect((await recentSaves(new Date('2026-11-21T05:00:00Z'), fetcher)).length).toBe(130);
		expect(asked.length).toBe(2);
		expect(asked[0]).toContain('since=2026-11-21T05%3A00%3A00.000Z');
	});

	test('anyone the copy refuses gets none, and the feed still has the posts', async () => {
		const fetcher = (async (url: string) => (url.startsWith('/api/sources') ? answer({}, false) : answer([item('/old', '2026-11-01T10:00:00Z'), item('/new', '2026-11-26T10:00:00Z')]))) as unknown as typeof fetch;
		const feed = await recentFeed({ saves: true, fetcher })(new Date('2026-11-21T05:00:00Z'));
		expect(feed.map((one) => one.block.url)).toEqual(['/new']);
	});
});

describe('likeness', () => {
	const picture: Block = { kind: 'arena', url: 'https://www.are.na/block/1', title: 'Kettle', icon: '🖼️', image: 'https://images.example/kettle.jpg' };
	const article: Block = { kind: 'post', url: '/2026/11/20/tables/', title: 'On tables', excerpt: 'Boards of things.', icon: '📄', image: '/files/cover.jpg' };

	test('a picture is what leads with its picture', () => {
		expect(isPicture(picture)).toBe(true);
		expect(isPicture({ kind: 'image', image: '/a.jpg' })).toBe(true);
		expect(isPicture(article)).toBe(false);
		expect(isPicture({ kind: 'arena', icon: '🖼️' })).toBe(false);
	});

	test('a picture asks by how it looks, anything else by its words', async () => {
		const asked: URLSearchParams[] = [];
		const fetcher = (async (url: string) => {
			asked.push(new URL(url, 'https://x.test').searchParams);
			return { ok: true, json: async () => ({ blocks: [picture] }) } as Response;
		}) as unknown as typeof fetch;
		expect(await similarBlocks(picture, 12, fetcher, 'https://site.test')).toEqual([picture]);
		expect(asked[0].get('picture')).toBe('https://images.example/kettle.jpg');
		await similarBlocks(article, 12, fetcher, 'https://site.test');
		expect(asked[1].get('like')).toBe('https://site.test/2026/11/20/tables/');
		expect(asked[1].get('words')).toBe('On tables. Boards of things.');
		expect(asked[1].has('picture')).toBe(false);
	});
});
