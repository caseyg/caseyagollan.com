import { expect, test } from 'bun:test';
import { hashItem, itemHash, searchTableTexts, tableTexts } from '../src/lib/table-search';

const shape = (id: string, type: string, props: object, y = 0) => ({ typeName: 'shape', id: `shape:${id}`, type, x: 0, y, props });
const rich = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const document = {
	schema: {},
	store: {
		a: shape('a', 'site-block', { kind: 'book', url: '/library/1/', title: 'The Dispossessed', excerpt: 'An ambiguous utopia on Anarres', meta: 'Ursula K. Le Guin' }),
		b: shape('b', 'note', { richText: rich('Ask about the café seating') }, 100),
		c: shape('c', 'frame', { name: 'Reading list' }, 200),
		d: shape('d', 'arrow', {}, 300),
		page: { typeName: 'page', id: 'page:1' }
	}
};

test('reads the words on a table in reading order', () => {
	expect(tableTexts(document)).toEqual([
		{ id: 'a', icon: '📚', title: 'The Dispossessed', text: 'An ambiguous utopia on Anarres · Ursula K. Le Guin' },
		{ id: 'b', icon: '🗒️', title: '', text: 'Ask about the café seating' },
		{ id: 'c', icon: '🔲', title: '', text: 'Reading list' }
	]);
	expect(tableTexts(null)).toEqual([]);
});

test('finds things by every typed word, whatever the case or accents', () => {
	const tables = [{ table: { id: 'tab1', name: 'Fiction' }, texts: tableTexts(document) }, { table: { id: 'tab2', name: 'Cafe plans' }, texts: [] }];
	expect(searchTableTexts(tables, 'guin utopia')).toEqual([{ table: 'tab1', name: 'Fiction', item: 'a', icon: '📚', label: 'The Dispossessed', excerpt: 'An ambiguous utopia on Anarres · Ursula K. Le Guin' }]);
	expect(searchTableTexts(tables, 'CAFE').map((result) => [result.table, result.item, result.label])).toEqual([['tab1', 'b', 'Ask about the café seating'], ['tab2', undefined, 'Cafe plans']]);
	expect(searchTableTexts(tables, 'guin missing')).toEqual([]);
	expect(searchTableTexts(tables, '  ')).toEqual([]);
});

test('a result link names the thing to show', () => {
	expect(hashItem(itemHash('abc-1'))).toBe('abc-1');
	expect(itemHash()).toBe('');
	expect(hashItem('#item=<script>')).toBeNull();
});

test('the server keeps what tables say, reads changed tables again, and hides drafts from visitors', async () => {
	const { searchTables } = await import('../src/lib/server/tables');
	const objects = new Map<string, string>();
	let reads = 0;
	const bucket = {
		get: async (key: string) => { reads++; const body = objects.get(key); return body === undefined ? null : { json: async () => JSON.parse(body) }; },
		put: async (key: string, body: string) => void objects.set(key, body)
	} as unknown as R2Bucket;
	const summary = (id: string, name: string, updated: string, published: boolean) => ({ id, name, created: updated, updated, count: 1, preview: [], published });
	objects.set('tables/index.json', JSON.stringify([summary('open1', 'Open', '2026-01-02', true), summary('draft1', 'Draft', '2026-01-01', false)]));
	objects.set('tables/open1.json', JSON.stringify({ ...summary('open1', 'Open', '2026-01-02', true), document }));
	objects.set('tables/draft1.json', JSON.stringify({ ...summary('draft1', 'Draft', '2026-01-01', false), document: { schema: {}, store: { n: shape('n', 'text', { richText: rich('Secret anarres notes') }) } } }));

	expect((await searchTables(bucket, 'anarres')).map((result) => result.table)).toEqual(['open1']);
	expect((await searchTables(bucket, 'anarres', true)).map((result) => [result.table, result.item])).toEqual([['open1', 'a'], ['draft1', 'n']]);
	// Nothing changed: the index and the kept words, no tables.
	reads = 0;
	await searchTables(bucket, 'anarres', true);
	expect(reads).toBe(2);
	// A table that changed is read again.
	objects.set('tables/index.json', JSON.stringify([summary('open1', 'Open', '2026-01-03', true)]));
	objects.set('tables/open1.json', JSON.stringify({ ...summary('open1', 'Open', '2026-01-03', true), document: { schema: {}, store: {} } }));
	expect(await searchTables(bucket, 'anarres', true)).toEqual([]);
	expect(Object.keys(JSON.parse(objects.get('tables/search.json')!))).toEqual(['open1']);
});
