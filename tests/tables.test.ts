import { describe, expect, test } from 'bun:test';
import { blockUrl, cleanBlock, cleanName, emptyTable, linkBlock, summarizeDocument, validDocument, validId, BLOCK_SHAPE } from '../src/lib/tables';
import { blockFromSearch } from '../src/lib/table-sources';
import { listTables, readTable, writeTable } from '../src/lib/server/tables';

/** An in-memory stand-in for the R2 bucket's get and put. */
function bucket() {
	const objects = new Map<string, string>();
	return {
		objects,
		async get(key: string) {
			const value = objects.get(key);
			return value === undefined ? null : { json: async () => JSON.parse(value) };
		},
		async put(key: string, value: string) {
			objects.set(key, value);
		}
	} as unknown as R2Bucket & { objects: Map<string, string> };
}

const shape = (id: string, x: number, y: number, props: Record<string, unknown>) => ({ [id]: { id, typeName: 'shape', type: BLOCK_SHAPE, x, y, props } });

describe('tables', () => {
	test('blocks keep only safe links and imagery', () => {
		expect(blockUrl('/library/123')).toBe('/library/123');
		expect(blockUrl('//evil.example/')).toBeNull();
		expect(blockUrl('javascript:alert(1)')).toBeNull();
		expect(cleanBlock({ kind: 'book', url: '/library/1', title: ' Book ', image: 'http://insecure.example/a.jpg' })).toEqual({ kind: 'book', url: '/library/1', title: 'Book', meta: undefined, excerpt: undefined, image: undefined, icon: undefined });
		expect(cleanBlock({ kind: 'nope', url: '/', title: 'x' })).toBeNull();
		expect(cleanBlock({ kind: 'post', url: '/', title: '  ' })).toBeNull();
	});

	test('names are trimmed and ids are plain', () => {
		expect(cleanName('  Reading   room ')).toBe('Reading room');
		expect(cleanName('   ')).toBeNull();
		expect(validId(emptyTable('A').id)).toBe(true);
		expect(validId('../index')).toBe(false);
	});

	test('a pasted link becomes a link block; this site’s pages keep their path', () => {
		expect(linkBlock('tabletop.grantcuster.com')).toMatchObject({ kind: 'link', url: 'https://tabletop.grantcuster.com/', title: 'tabletop.grantcuster.com' });
		expect(linkBlock('https://caseyagollan.com/library/?x=1')).toMatchObject({ kind: 'link', url: '/library/?x=1', icon: '🏠' });
		expect(linkBlock('not a url at all')).toBeNull();
		expect(linkBlock('ftp://example.com')).toBeNull();
	});

	test('a document is summarized in reading order', () => {
		const document = {
			schema: {},
			store: {
				...shape('shape:b', 300, 0, { kind: 'book', url: '/library/2', title: 'Second' }),
				...shape('shape:a', 0, 0, { kind: 'post', url: '/a/', title: 'First' }),
				...shape('shape:c', 0, 400, { kind: 'wiki', url: 'https://cag.wiki/C', title: 'Third' }),
				'shape:note': { id: 'shape:note', typeName: 'shape', type: 'note', x: 0, y: 0, props: {} }
			}
		};
		const summary = summarizeDocument(document);
		expect(summary.count).toBe(3);
		expect(summary.preview.map((block) => block.title)).toEqual(['First', 'Second', 'Third']);
		expect(validDocument(document)).toBe(true);
		expect(validDocument({ store: {} })).toBe(false);
		expect(validDocument({ store: { big: 'x'.repeat(2_000_001) }, schema: {} })).toBe(false);
	});

	test('search results become blocks without repeating their title', () => {
		expect(blockFromSearch({ url: '/https://cag.wiki/Aesthetic+Crisis', excerpt: 'Aesthetic Crisis. Architects <mark>dressed</mark> up', meta: { title: 'Aesthetic Crisis', type: 'wiki' } })).toEqual({
			kind: 'wiki',
			url: 'https://cag.wiki/Aesthetic+Crisis',
			title: 'Aesthetic Crisis',
			meta: 'cag.wiki',
			excerpt: 'Architects dressed up'
		});
		// Wiki pages are indexed at their wiki browser address, with the cag.wiki one kept as `source`.
		expect(blockFromSearch({ url: '/wiki/aesthetic-crisis', excerpt: 'Architects', meta: { title: 'Aesthetic Crisis', type: 'wiki', source: 'https://cag.wiki/aesthetic-crisis' } })).toMatchObject({ kind: 'wiki', url: 'https://cag.wiki/aesthetic-crisis' });
		expect(blockFromSearch({ url: '/library/1', excerpt: '', meta: { title: 'Book', type: 'book', author: 'Hyde, Lewis', year: '2010', image: '/library/img/1.jpg' } })).toMatchObject({ kind: 'book', meta: 'Hyde, Lewis · 2010', image: '/library/img/1.jpg' });
		expect(blockFromSearch({ url: '/2026/11/14/x/', excerpt: 'Hello', meta: { title: 'Note', type: 'note', date: '2026-11-14T12:00:00Z' } })).toMatchObject({ kind: 'post', meta: 'note · 2026-11-14', icon: '📝' });
	});

	test('tables are stored with an index, newest change first', async () => {
		const store = bucket();
		const first = { ...emptyTable('First', 'aaaa1111', '2026-11-01T00:00:00.000Z') };
		const second = { ...emptyTable('Second', 'bbbb2222', '2026-11-02T00:00:00.000Z') };
		await writeTable(store, first);
		await writeTable(store, second);
		expect((await listTables(store)).map((table) => table.name)).toEqual(['Second', 'First']);
		await writeTable(store, { ...first, name: 'Renamed', updated: '2026-11-03T00:00:00.000Z' });
		const list = await listTables(store);
		expect(list.map((table) => table.name)).toEqual(['Renamed', 'Second']);
		expect('document' in list[0]).toBe(false);
		expect((await readTable(store, 'aaaa1111'))?.name).toBe('Renamed');
		expect(await readTable(store, '../x')).toBeNull();
		expect(await listTables(undefined)).toEqual([]);
	});
});
