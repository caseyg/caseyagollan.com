import { describe, expect, test } from 'bun:test';
import { blockKey, blockUrl, cleanBlock, isPublished, cleanName, emptyTable, linkBlock, summarizeDocument, validDocument, validId, BLOCK_SHAPE, type Table } from '../src/lib/tables';
import { blockFromSearch } from '../src/lib/table-sources';
import { passageUrl, piecesPath, quoteSize } from '../src/lib/table-pieces';
import { connectorPath, tableLayout, tableWireframe } from '../src/lib/table-wireframe';
import { listPublishedTables, listTables, readTable, writeTable } from '../src/lib/server/tables';
import { renderContent } from '../src/lib/utils/renderContent';

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
		expect(blockFromSearch({ url: '/https://www.are.na/block/2092617', excerpt: 'Light Phone 2. A phone', meta: { title: 'Light Phone 2', type: 'arena', kind: 'image', detail: 'Image · indiegogo.com', image: 'https://images.are.na/a.jpg' } })).toEqual({
			kind: 'arena',
			url: 'https://www.are.na/block/2092617',
			title: 'Light Phone 2',
			meta: 'Image · indiegogo.com',
			excerpt: 'A phone',
			image: 'https://images.are.na/a.jpg',
			icon: '🖼️'
		});
		expect(cleanBlock({ kind: 'arena', url: 'https://www.are.na/block/1', title: 'x' })).toMatchObject({ kind: 'arena' });
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

	test('new tables are drafts that only the owner lists; older tables stay public', async () => {
		const store = bucket();
		const draft = emptyTable('Draft', 'cccc3333', '2026-11-01T00:00:00.000Z');
		const { published: _published, ...older } = emptyTable('Older', 'dddd4444', '2026-11-02T00:00:00.000Z');
		const shown = { ...emptyTable('Shown', 'eeee5555', '2026-11-03T00:00:00.000Z'), published: true };
		expect(isPublished(draft)).toBe(false);
		expect(isPublished(older as Table)).toBe(true);
		for (const table of [draft, older as Table, shown]) await writeTable(store, table);
		expect((await listPublishedTables(store)).map((table) => table.name)).toEqual(['Shown', 'Older']);
		expect((await listTables(store)).map((table) => table.name)).toEqual(['Shown', 'Older', 'Draft']);
	});

	test('a bare table link in a post becomes a framed table, with its link kept', () => {
		const html = renderContent('Look:\n\nhttps://caseyagollan.com/tables/abcd1234\n\n[a table](https://caseyagollan.com/tables/abcd1234)');
		expect(html).toContain('<iframe src="https://caseyagollan.com/tables/abcd1234/embed"');
		expect(html).toContain('<a href="https://caseyagollan.com/tables/abcd1234">Open the table</a>');
		// A labelled link stays a link.
		expect(html).toContain('>a table</a>');
		expect(html.match(/<iframe/g)).toHaveLength(1);
		// Frames from elsewhere on the site, or other hosts, are dropped.
		expect(renderContent('<iframe src="https://caseyagollan.com/account"></iframe>', 'html')).not.toContain('iframe');
		expect(renderContent('<iframe src="https://evil.example/tables/abcd1234/embed"></iframe>', 'html')).not.toContain('iframe');
	});
});

describe('table pieces', () => {
	test('reads pieces from posts and wiki pages, not books or links', () => {
		expect(piecesPath({ kind: 'post', url: '/2026/11/14/changelog' })).toBe('/2026/11/14/changelog');
		expect(piecesPath({ kind: 'quote', url: '/2026/11/14/changelog#:~:text=Hello' })).toBe('/2026/11/14/changelog');
		expect(piecesPath({ kind: 'book', url: '/library/1' })).toBeNull();
		expect(piecesPath({ kind: 'link', url: 'https://example.com/' })).toBeNull();
		expect(piecesPath({ kind: 'wiki', url: 'https://cag.wiki/A' }, () => '/wiki/a')).toBe('/wiki/a');
		expect(piecesPath({ kind: 'post', url: 'https://bsky.app/profile/a/post/b' })).toBeNull();
	});

	test('links a passage by its first words', () => {
		expect(passageUrl('/a', '  The quick-brown fox jumps over the lazy dog and keeps going ')).toBe('/a#:~:text=The%20quick%2Dbrown%20fox%20jumps%20over%20the%20lazy%20dog');
	});

	test('sizes quotes to their words', () => {
		expect(quoteSize('short').h).toBe(140);
		expect(quoteSize('x'.repeat(2000)).h).toBe(460);
	});

	test('tells pictures from the same page apart', () => {
		expect(blockKey({ url: '/a', image: '/1.jpg' })).not.toBe(blockKey({ url: '/a', image: '/2.jpg' }));
		expect(blockKey({ url: '/a' })).toBe('/a');
		expect(cleanBlock({ kind: 'quote', url: '/a#:~:text=x', title: 'A', excerpt: 'Words' })).toMatchObject({ kind: 'quote' });
	});
});

describe('table pictures', () => {
	const doc = (records: Record<string, unknown>[]) => ({ schema: {}, store: Object.fromEntries(records.map((r) => [r.id as string, r])) });
	const block = (id: string, x: number, y: number) => ({ id, typeName: 'shape', type: 'site-block', parentId: 'page:page', x, y, props: { w: 240, h: 240, kind: 'post', url: '/', title: 'A' } });

	test('lays out blocks, notes and frames where they sit, with children inside frames', () => {
		const { boxes } = tableLayout(doc([block('shape:a', 0, 0), { id: 'shape:f', typeName: 'shape', type: 'frame', x: 500, y: 0, props: { w: 400, h: 300 } }, { id: 'shape:n', typeName: 'shape', type: 'note', parentId: 'shape:f', x: 10, y: 20, props: { scale: 1 } }, { id: 'shape:d', typeName: 'shape', type: 'draw', x: 0, y: 0, props: {} }]));
		expect(boxes.map((b) => [b.id, b.x, b.y, b.w, b.h, !!b.frame])).toEqual([
			['shape:a', 0, 0, 240, 240, false],
			['shape:f', 500, 0, 400, 300, true],
			['shape:n', 510, 20, 200, 200, false]
		]);
	});

	test('joins bound arrows from the facing sides of their boxes', () => {
		const layout = tableLayout(doc([
			block('shape:a', 0, 0),
			block('shape:b', 600, 0),
			{ id: 'shape:arrow', typeName: 'shape', type: 'arrow', x: 0, y: 0, props: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } } },
			{ id: 'binding:1', typeName: 'binding', type: 'arrow', fromId: 'shape:arrow', toId: 'shape:a', props: { terminal: 'start' } },
			{ id: 'binding:2', typeName: 'binding', type: 'arrow', fromId: 'shape:arrow', toId: 'shape:b', props: { terminal: 'end' } }
		]));
		expect(layout.connectors).toHaveLength(1);
		expect(connectorPath(layout.connectors[0])).toMatch(/^M240 120C.* 600 120$/);
	});

	test('draws nothing for an empty table, and an inert SVG otherwise', () => {
		expect(tableWireframe(null)).toBeNull();
		expect(tableWireframe(doc([]))).toBeNull();
		const svg = tableWireframe(doc([block('shape:a', 0, 0)]))!;
		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
		expect(svg).not.toMatch(/<text|<image|<foreignObject|<script|href/);
	});
});
