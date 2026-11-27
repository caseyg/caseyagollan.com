import { describe, expect, test } from 'bun:test';
import { readwise } from '../src/lib/server/sources/plugins/readwise';
import { fillThin, rawKey, syncSource, syncStatus } from '../src/lib/server/sources/sync';
import { SourceBusy, type SourcePlugin, type SyncContext, type SyncState, type SyncStep } from '../src/lib/server/sources/types';
import { document, memoryIndex } from './helpers/sources';

const context = (fetcher: (url: URL, init?: RequestInit) => Response | Promise<Response>, at = '2026-11-27T12:00:00.000Z'): SyncContext => ({
	env: { READWISE_ACCESS_TOKEN: 'token' }, now: () => new Date(at), markdown: (html) => html.replace(/<[^>]+>/g, '').trim(),
	fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => fetcher(new URL(String(input)), init)) as typeof fetch
});

/** A source of numbered pages, as a plugin sees them. */
function paged(pages: SyncStep[], seen: SyncState[] = []): SourcePlugin {
	return { id: 'readwise', name: 'Paged', icon: '•', configured: () => true, sync: async (_context, state) => { seen.push(structuredClone(state)); return pages[(state.cursor as number | undefined) ?? 0]; } };
}
const page = (ids: string[], next?: number, over: Partial<SyncStep> = {}): SyncStep => ({ documents: ids.map((id) => ({ document: document({ id }), raw: { id, whole: true } })), ...(next === undefined ? { done: true } : { cursor: next, done: false }), ...over });

describe('syncing a source', () => {
	test('a first pass is spread over runs, and carries on where it stopped', async () => {
		const index = memoryIndex(), seen: SyncState[] = [], kept = new Map<string, string>();
		const plugin = paged([page(['a', 'b'], 1), page(['c'], 2), page(['d'])], seen);
		const deps = { index, context: context(() => new Response('')), raw: { put: async (key: string, value: string) => { kept.set(key, value); } }, maxSteps: 2 };
		const first = await syncSource(plugin, deps);
		expect(first).toMatchObject({ steps: 2, added: 3, done: false });
		expect(syncStatus(index, [plugin], {})[0]).toMatchObject({ documents: 3, syncing: true, everything: false });
		const second = await syncSource(plugin, deps);
		expect(second).toMatchObject({ steps: 1, added: 1, done: true });
		expect(seen.map((state) => state.cursor)).toEqual([undefined, 1, 2]);
		// Every record is kept whole in private storage, by source and id.
		expect([...kept.keys()].sort()).toEqual(['a', 'b', 'c', 'd'].map((id) => rawKey('readwise', id)));
		expect(JSON.parse(kept.get(rawKey('readwise', 'a'))!)).toEqual({ id: 'a', whole: true });
		expect(syncStatus(index, [plugin], {})[0]).toMatchObject({ documents: 4, syncing: false, everything: true, synced: '2026-11-27T12:00:00.000Z' });
	});

	test('a finished pass is not repeated until it is due, and then asks only for what changed', async () => {
		const index = memoryIndex(), seen: SyncState[] = [];
		const plugin = paged([page(['a'])], seen);
		await syncSource(plugin, { index, context: context(() => new Response('')) });
		expect(await syncSource(plugin, { index, context: context(() => new Response(''), '2026-11-27T12:05:00.000Z') })).toMatchObject({ skipped: 'not-due', steps: 0 });
		await syncSource(plugin, { index, context: context(() => new Response(''), '2026-11-27T12:30:00.000Z') });
		expect(seen).toHaveLength(2);
		expect(seen[1].since).toBe('2026-11-27T12:00:00.000Z');
	});

	test('a whole pass removes what the source no longer has; a pass of changes does not', async () => {
		const index = memoryIndex();
		await syncSource(paged([page(['a', 'b'], undefined, { complete: true })]), { index, context: context(() => new Response('')), everyMinutes: 0 });
		const changes = await syncSource(paged([page(['a'])]), { index, context: context(() => new Response(''), '2026-11-27T13:00:00.000Z'), everyMinutes: 0 });
		expect(changes.removed).toBe(0);
		const whole = await syncSource(paged([page(['a'], undefined, { complete: true })]), { index, context: context(() => new Response(''), '2026-11-27T14:00:00.000Z'), everyMinutes: 0 });
		expect(whole.removed).toBe(1);
		expect(index.get('readwise:b', { owner: true })).toBeNull();
		expect(index.get('readwise:a', { owner: true })?.title).toBe('Document a');
	});

	test('a busy service is waited for, and a failing one never takes the sync down or speaks in the report', async () => {
		const index = memoryIndex();
		const busy: SourcePlugin = { ...paged([]), sync: async () => { throw new SourceBusy('readwise', 42); } };
		expect(await syncSource(busy, { index, context: context(() => new Response('')) })).toMatchObject({ busy: 42, done: false, steps: 0 });
		const broken: SourcePlugin = { ...paged([]), sync: async () => { throw new Error('secret words from the service'); } };
		const report = await syncSource(broken, { index, context: context(() => new Response('')), everyMinutes: 0 });
		expect(report).toMatchObject({ failed: true, steps: 0 });
		expect(JSON.stringify(report)).not.toContain('secret');
		const off: SourcePlugin = { ...paged([]), configured: () => false };
		expect(await syncSource(off, { index, context: context(() => new Response('')) })).toMatchObject({ skipped: 'not-configured' });
	});

	test('thin links get their page’s text once', async () => {
		const index = memoryIndex();
		index.upsert([document({ id: 'thin', source: 'raindrop', url: 'https://example.com/page' }), document({ id: 'full', text: 'Plenty of words here already. '.repeat(40) })], '2026-11-27T12:00:00.000Z');
		const asked: string[] = [];
		const read = async (url: string) => { asked.push(url); return { text: 'The page says a good deal about marmalade. '.repeat(10), image: 'https://example.com/og.jpg' }; };
		expect(await fillThin(index, read)).toEqual({ read: 1, filled: 1 });
		expect(asked).toEqual(['https://example.com/page']);
		expect(index.search({ owner: true, query: 'marmalade' }).hits.map((hit) => hit.key)).toEqual(['raindrop:thin']);
		expect(await fillThin(index, read)).toEqual({ read: 0, filled: 0 });
	});
});

describe('the Readwise plugin', () => {
	test('walks each shelf with whole texts, then highlights, then the export, asking only for changes after the first pass', async () => {
		const asked: string[] = [];
		const reader = (url: URL) => {
			asked.push(`${url.pathname}?${url.searchParams}`);
			const location = url.searchParams.get('location');
			if (url.pathname.endsWith('/v2/export/')) return Response.json({ results: [
				{ user_book_id: 7, title: 'A Kindle book', author: 'By Ann Author', source: 'kindle', category: 'books', highlights: [{ id: 70, text: 'Underlined on the train.' }, { id: 71, is_deleted: true }] },
				{ user_book_id: 8, title: 'Already in Reader', source: 'reader', highlights: [{ id: 80, text: 'Twice.' }] }
			] });
			if (url.searchParams.get('category') === 'highlight') return Response.json({ results: [{ id: 'h1', parent_id: 'd1', content: 'The kettle is the calmest machine.', notes: 'yes', tags: { calm: { name: 'calm' } } }] });
			if (location === 'new' && !url.searchParams.get('pageCursor')) return Response.json({ nextPageCursor: 'p2', results: [{ id: 'd1', title: 'On kettles', source_url: 'https://example.com/kettles', url: 'https://read.readwise.io/read/d1', location: 'new', category: 'article', html_content: '<p>Whole <b>text</b> of the article.</p>', saved_at: '2026-11-20T10:00:00Z', tags: { tea: { name: 'tea' } }, word_count: 6 }] });
			if (location === 'new') return Response.json({ results: [{ id: 'd2', title: 'Second page', location: 'new', content: 'plain' }] });
			return Response.json({ results: [] });
		};
		const index = memoryIndex();
		for (let run = 0; run < 2; run++) await syncSource(readwise, { index, context: context(reader), maxSteps: 4 });
		expect(asked.filter((url) => url.includes('/v3/list/')).map((url) => new URLSearchParams(url.split('?')[1]).get('location') ?? 'highlights')).toEqual(['new', 'new', 'later', 'shortlist', 'archive', 'highlights']);
		expect(asked.some((url) => url.includes('location=feed'))).toBe(false);
		expect(asked[0]).toContain('withHtmlContent=true');
		const article = index.get('readwise:d1', { owner: true })!;
		expect(article).toMatchObject({ title: 'On kettles', url: 'https://example.com/kettles', private: true, tags: ['tea'], places: ['Inbox'], text: 'Whole text of the article.' });
		expect(article.allHighlights.map((highlight) => [highlight.text, highlight.note])).toEqual([['The kettle is the calmest machine.', 'yes']]);
		expect(index.search({ owner: true, query: 'calmest machine' }).hits[0].key).toBe('readwise:d1');
		// What was highlighted outside Reader arrives from the export; what Reader already sent is not doubled.
		expect(index.get('readwise:book:7', { owner: true })).toMatchObject({ kind: 'book', author: 'Ann Author', places: ['Highlights'] });
		expect(index.get('readwise:book:8', { owner: true })).toBeNull();
		// Nothing of Readwise is ever public.
		expect(index.search({ owner: false, query: 'kettles' }).hits).toEqual([]);
		// The next pass asks each list only for what changed.
		asked.length = 0;
		await syncSource(readwise, { index, context: context(reader, '2026-11-27T13:00:00.000Z'), maxSteps: 8, everyMinutes: 0 });
		expect(asked.every((url) => url.includes('updatedAfter=2026-11-27T12%3A00%3A00.000Z'))).toBe(true);
	});

	test('a 429 is reported as busy with the wait the service asked for', async () => {
		const report = await syncSource(readwise, { index: memoryIndex(), context: context(() => new Response('slow down', { status: 429, headers: { 'retry-after': '30' } })) });
		expect(report).toMatchObject({ busy: 30, steps: 0, done: false });
	});
});
