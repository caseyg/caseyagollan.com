import { describe, expect, test } from 'bun:test';
import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema';
import { T } from '@tldraw/validate';
import { MADE_FOR, SCHEMA, documentTable, indexAbove, indexBelow, textSize, toRichText } from '../src/lib/table-document';
import { labelIssues, routeArrows } from '../src/lib/table-arrange';
import { tablePlanSvg } from '../src/lib/table-plan';
import { tablePictureJpeg } from '../src/lib/server/table-picture';

// The canvas's own schema: tldraw's shapes and the site's block (`SiteBlockShapeUtil.props`).
const blockProps = { w: T.nonZeroNumber, h: T.nonZeroNumber, kind: T.string, url: T.string, title: T.string, meta: T.string, excerpt: T.string, image: T.string, icon: T.string, hideMeta: T.boolean, ref: T.string, form: T.string, quote: T.string, marked: T.boolean };
const schema = createTLSchema({ shapes: { ...defaultShapeSchemas, 'site-block': { props: blockProps } } as never, bindings: defaultBindingSchemas });
/** Every record must be one tldraw would load: the same check its store makes. */
const valid = (document: unknown) => {
	for (const record of Object.values((document as { store: Record<string, { typeName: string }> }).store)) schema.types[record.typeName as 'shape'].validate(record as never);
};

let count = 0;
const fresh = () => { count = 0; return documentTable(null, { id: () => `t${++count}` }); };
const post = { kind: 'post' as const, url: '/2026/11/01/hello/', title: 'Hello', excerpt: 'A note.' };

describe('a table changed where it is saved', () => {
	test('is written for the tldraw the canvas runs', () => {
		const now = schema.serialize() as { schemaVersion: number; sequences: Record<string, number> };
		expect({ ...SCHEMA.sequences, 'com.tldraw.shape.site-block': 0 } as Record<string, number>).toEqual({ ...now.sequences, 'com.tldraw.shape.site-block': 0 });
		for (const [kind, version] of Object.entries(MADE_FOR)) expect([kind, (SCHEMA.sequences as Record<string, number>)[kind]]).toEqual([kind, version]);
	});

	test('everything it makes is a record tldraw loads', () => {
		const table = fresh();
		const notes = table.perform({ op: 'add_notes', notes: [{ text: 'One' }, { text: 'Two\nlines of it', style: 'text', w: 300, color: 'yellow' }, { text: 'x', blank: true }, { text: 'A sticky note with enough words on it that it has to grow taller than its square to hold them all, as the canvas would have it, line after line after line.' }] }) as { added: string[] };
		expect(notes.added).toHaveLength(3);
		const blocks = table.perform({ op: 'add_blocks', blocks: [post, { ...post, url: '/b/', kind: 'book' }], at: { x: 0, y: 800 } }) as { added: string[] };
		const arrows = table.perform({ op: 'connect', links: [{ from: notes.added[0], to: notes.added[1], label: 'leads to' }, { from: blocks.added[0], to: 'nope' }, { from: notes.added[1], to: blocks.added[0], dash: 'dashed', both_ends: true }] }) as { added: string[]; not_found: string[] };
		expect(arrows.added).toHaveLength(2);
		expect(arrows.not_found).toEqual([`${blocks.added[0]}→nope`]);
		const frame = table.perform({ op: 'frame', name: 'Posts', ids: blocks.added }) as { added: string[]; holds: string[] };
		table.perform({ op: 'group', ids: [notes.added[0], notes.added[1]] });
		table.perform({ op: 'arrange', layout: 'layered' });
		table.perform({ op: 'tidy' });
		valid(table.document());
		expect(table.changed()).toBe(true);
		const items = table.items();
		expect(items.find((item) => item.id === blocks.added[0])).toMatchObject({ type: 'post', parent: frame.added[0], w: 240, h: 240 });
		// The frame sits under what it holds and under the arrows.
		const store = (table.document() as { store: Record<string, { index: string }> }).store;
		expect(store[`shape:${frame.added[0]}`].index < store[`shape:${notes.added[0]}`].index).toBe(true);
	});

	test('a table saved by another version of the canvas moves, but takes nothing new', () => {
		const made = fresh();
		const [id] = (made.perform({ op: 'add_notes', notes: [{ text: 'Old' }] }) as { added: string[] }).added;
		const old = { ...(made.document() as { store: object }), schema: { schemaVersion: 2, sequences: { ...SCHEMA.sequences, 'com.tldraw.shape.note': 1 } } };
		const table = documentTable(old);
		expect(table.perform({ op: 'move', moves: [{ id, x: 400, y: 400 }] })).toMatchObject({ moved: 1 });
		expect(() => table.perform({ op: 'add_note', text: 'New' })).toThrow('table_open');
	});

	test('reads sizes for text, which the document doesn’t keep', () => {
		expect(textSize({ richText: toRichText('1 — Numbers\nSubsidies, taxes, standards — the sizes of constants'), w: 300, autoSize: false }).h).toBeGreaterThan(90);
		const table = fresh();
		table.perform({ op: 'add_note', text: 'A title for the whole table', style: 'text', w: 320 });
		const read = table.perform({ op: 'read' }) as { items: { w: number; h: number }[] };
		expect(read.items[0].w).toBe(320);
		expect(read.items[0].h).toBeGreaterThan(30);
	});

	test('moving a frame carries what it holds; removing a card takes its arrows', () => {
		const table = fresh();
		const [a, b] = (table.perform({ op: 'add_blocks', blocks: [post, { ...post, url: '/two/' }], at: { x: 0, y: 0 } }) as { added: string[] }).added;
		const [arrow] = (table.perform({ op: 'connect', links: [{ from: a, to: b }] }) as { added: string[] }).added;
		const [frame] = (table.perform({ op: 'frame', name: 'Both', ids: [a, b] }) as { added: string[] }).added;
		const before = table.items().find((item) => item.id === b)!;
		table.perform({ op: 'move', moves: [{ id: frame, x: 1000, y: 1000 }] });
		const after = table.items().find((item) => item.id === b)!;
		expect([after.x - before.x, after.y - before.y]).toEqual([1040, 1040]);
		expect(table.perform({ op: 'remove', ids: [a] })).toEqual({ removed: 1 });
		expect(table.items().some((item) => item.id === arrow)).toBe(false);
		expect(Object.values((table.document() as { store: Record<string, { typeName: string }> }).store).some((record) => record.typeName === 'binding')).toBe(false);
		valid(table.document());
	});

	test('a title joined to nothing heads a flow, and what only a canvas can do says so', () => {
		const table = fresh();
		const [title, one, two] = (table.perform({ op: 'add_notes', notes: [{ text: 'The title', style: 'text' }, { text: 'First', style: 'text' }, { text: 'Second', style: 'text' }], at: { x: 0, y: 500 } }) as { added: string[] }).added;
		table.perform({ op: 'connect', links: [{ from: one, to: two }] });
		const done = table.perform({ op: 'arrange', layout: 'layered' }) as { note?: string };
		expect(done.note).toBeUndefined();
		const at = (id: string) => table.items().find((item) => item.id === id)!;
		expect(at(title).y).toBeLessThan(at(one).y);
		expect(at(one).y).toBeLessThan(at(two).y);
		expect(() => table.perform({ op: 'draw', strokes: [{ around: one }] })).toThrow('table_open');
	});

	test('index keys sort where they should', () => {
		for (const key of ['a1', 'a1V', 'aDatI', 'aAnXYM', 'az', 'b10']) {
			expect(indexAbove(key) > key).toBe(true);
			T.indexKey.validate(indexAbove(key));
			const below = indexBelow(key);
			if (below) { expect(below < key).toBe(true); T.indexKey.validate(below); }
		}
	});
});

describe('arrows routed between cards', () => {
	const box = (id: string, x: number, y: number) => ({ id, x, y, w: 300, h: 120 });
	test('arrows that share a side of a card fan out along it, in the order of where they go', () => {
		const boxes = [box('hub', 400, 0), box('left', 0, 400), box('mid', 400, 400), box('right', 800, 400)];
		const routes = routeArrows(boxes, [{ id: 'r', from: 'hub', to: 'right' }, { id: 'l', from: 'hub', to: 'left' }, { id: 'm', from: 'hub', to: 'mid' }]);
		const starts = Object.fromEntries(routes.map((route) => [route.id, route.start.x]));
		expect(starts.l).toBeLessThan(starts.m);
		expect(starts.m).toBeLessThan(starts.r);
		expect(routes.every((route) => route.startPrecise && !route.endPrecise)).toBe(true);
	});

	test('arrows there and back run apart, and a covered label is reported', () => {
		const boxes = [box('a', 0, 0), box('b', 0, 500)];
		const routes = routeArrows(boxes, [{ id: 'one', from: 'a', to: 'b', label: 'feeds' }, { id: 'two', from: 'b', to: 'a', label: 'sets rate' }]);
		// There and back between two cards run side by side, not one on top of the other.
		expect(routes[0].start.x).not.toBe(routes[1].end.x);
		const line = { id: 'x', a: { x: 150, y: 60 }, b: { x: 150, y: 960 }, from: box('a', 0, 0), to: box('c', 0, 900), bend: 0, label: 'sizes' };
		expect(labelIssues([box('a', 0, 0), box('b', 0, 450), box('c', 0, 900)], [line])).toEqual({ labels_covered: [['x', 'b']] });
		expect(labelIssues([box('a', 0, 0), box('c', 0, 900)], [line])).toEqual({});
	});
});

describe('a picture of a saved table', () => {
	test('draws cards, arrows and labels, numbered; and asks Browser Rendering for the JPEG', async () => {
		const table = fresh();
		const [one, two] = (table.perform({ op: 'add_notes', notes: [{ text: 'First <b>', style: 'text' }, { text: 'Second', style: 'text' }], layout: 'column' }) as { added: string[] }).added;
		table.perform({ op: 'connect', links: [{ from: one, to: two, label: 'then' }] });
		const picture = tablePlanSvg(table.plan())!;
		expect(picture.svg).toContain('First &lt;b&gt;');
		expect(picture.svg).toContain('>then<');
		expect(tablePlanSvg(fresh().plan())).toBeUndefined();
		let asked: { html: string; viewport: { width: number } } | undefined;
		const jpeg = await tablePictureJpeg({ CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'token' }, picture, (async (_url: string, init: RequestInit) => { asked = JSON.parse(String(init.body)); return new Response(new Uint8Array([0xff, 0xd8, 0xff])); }) as never);
		expect(jpeg).toEqual({ mimeType: 'image/jpeg', data: '/9j/' });
		expect(asked!.html).toContain('<svg');
		expect(asked!.viewport.width).toBe(picture.width);
		expect(await tablePictureJpeg({}, picture)).toBeNull();
	});
});
