import { describe, expect, test } from 'bun:test';
import { TABLE_ARRANGEMENTS } from '../src/lib/table-agent';
import { AUTO_LAYOUT, autoLayoutOf, contextItems, layoutLabel, TOOLS, type TableContextItem, type TableContextState, layoutOp, layoutScopes, MORE_TOOLS, moreToolFor, TABLE_LAYOUTS, toolChoice } from '../src/lib/table-menus';

describe('the Layout menu', () => {
	test('offers every layout the chat can use', () => {
		const offered = new Set(TABLE_LAYOUTS.map((item) => item.value.split(':')[0]));
		for (const layout of TABLE_ARRANGEMENTS) expect(offered.has(layout)).toBe(true);
		expect(new Set(TABLE_LAYOUTS.map((item) => item.value)).size).toBe(TABLE_LAYOUTS.length);
	});

	test('lays out the whole table, or only what is selected', () => {
		expect(layoutOp('tree', 'table', ['a', 'b'])).toEqual({ op: 'arrange', layout: 'tree', zoom: false });
		expect(layoutOp('tree', 'selection', ['a', 'b'])).toEqual({ op: 'arrange', layout: 'tree', zoom: false, ids: ['a', 'b'] });
		expect(layoutOp('grid', 'selection', [])).toEqual({ op: 'arrange', layout: 'grid', zoom: false });
		expect(layoutOp('nonsense', 'table', [])).toBeUndefined();
	});

	test('groups are made without drawing areas around them', () => {
		expect(layoutOp('cluster:color', 'table', [])).toEqual({ op: 'arrange', layout: 'cluster', zoom: false, by: 'color', frame: false });
	});

	test('a selection can be laid out when it is several things, or one area', () => {
		expect(layoutScopes([])).toEqual({ selection: false, label: '' });
		expect(layoutScopes([{ type: 'post' }])).toEqual({ selection: false, label: '' });
		expect(layoutScopes([{ type: 'frame' }])).toEqual({ selection: true, label: 'Inside this area' });
		expect(layoutScopes([{ type: 'post' }, { type: 'note' }])).toEqual({ selection: true, label: '2 selected' });
	});

	test('auto layout is read from the document’s meta, known layouts only', () => {
		expect(autoLayoutOf({ [AUTO_LAYOUT]: 'tree' })).toBe('tree');
		expect(autoLayoutOf({ [AUTO_LAYOUT]: 'cluster:kind' })).toBe('cluster:kind');
		expect(autoLayoutOf({ [AUTO_LAYOUT]: 'spiral' })).toBeUndefined();
		expect(autoLayoutOf({ [AUTO_LAYOUT]: true })).toBeUndefined();
		expect(autoLayoutOf({})).toBeUndefined();
		expect(autoLayoutOf(undefined)).toBeUndefined();
	});
});

describe('the More tools menu', () => {
	const all = MORE_TOOLS.flatMap((item) => item.items ?? [item]);

	test('holds the tools of tldraw’s toolbar that the bar leaves out', () => {
		const values = all.map((item) => item.value);
		for (const tool of ['frame', 'media', 'line', 'highlight', 'laser']) expect(values).toContain(tool);
		for (const geo of ['rectangle', 'ellipse', 'triangle', 'diamond', 'hexagon', 'oval', 'rhombus', 'star', 'cloud', 'heart', 'x-box', 'check-box', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-right']) expect(values).toContain(`geo:${geo}`);
	});

	test('a choice becomes a tldraw tool, shapes through the geo tool', () => {
		expect(toolChoice('line')).toEqual({ tool: 'line' });
		expect(toolChoice('geo:star')).toEqual({ tool: 'geo', geo: 'star' });
		expect(toolChoice('media')).toBeUndefined();
	});

	test('the tool in hand is found again, for the button to show', () => {
		expect(moreToolFor('geo', 'ellipse')?.label).toBe('Ellipse');
		expect(moreToolFor('geo', 'cloud')?.label).toBe('Cloud');
		expect(moreToolFor('laser')?.label).toBe('Laser pointer');
		expect(moreToolFor('select')).toBeUndefined();
		expect(moreToolFor('draw')).toBeUndefined();
	});
});

test('picking a layout leaves its menu open, on the toolbar and on right-click', () => {
	for (const layout of TABLE_LAYOUTS) expect(layout.keepOpen).toBe(true);
	const items = contextItems({ selection: [{ type: 'post' }, { type: 'note' }] } as TableContextState);
	for (const menu of items.filter((item) => item.value.startsWith('layout:'))) for (const layout of menu.items ?? []) expect(layout.keepOpen).toBe(true);
	expect(items.find((item) => item.value === 'undo')?.keepOpen).toBeUndefined();
});

test('while auto layout is on, the whole table’s layouts are one-of-many, with the kept one checked', () => {
	const of = (state: Partial<TableContextState>) => contextItems({ selection: [], ...state } as TableContextState).find((item) => item.value === 'layout:table')?.items ?? [];
	const on = of({ autoLayout: 'tree' });
	expect(on.every((item) => item.radio)).toBe(true);
	expect(on.filter((item) => item.checked).map((item) => item.value)).toEqual(['layout:table:tree']);
	expect(of({}).some((item) => item.radio || item.checked !== undefined)).toBe(false);
	expect(layoutLabel('tree')).toBe('Tree');
	expect(layoutLabel(undefined)).toBeUndefined();
});

test('every layout and every tool in the menus has an icon', () => {
	for (const item of [...TABLE_LAYOUTS, ...MORE_TOOLS, ...MORE_TOOLS.flatMap((tool) => tool.items ?? [])]) expect(item.icon).toBeTruthy();
});

describe('the right-click menu', () => {
	const base: TableContextState = { selection: [], tool: 'select', canUndo: false, canRedo: false };
	const full: TableContextState = { ...base, auto: true, tags: true, media: true, voice: { status: 'off', correct: true, arrange: false, commands: false }, published: false, post: true };
	const flat = (items: TableContextItem[]): TableContextItem[] => items.flatMap((item) => [item, ...flat(item.items ?? [])]);
	const values = (state: TableContextState) => flat(contextItems(state)).map((item) => item.value);

	test('offers what the toolbar does: every layout, tool and shape, and the rest', () => {
		const all = values(full);
		for (const layout of TABLE_LAYOUTS) expect(all).toContain(`layout:table:${layout.value}`);
		for (const tool of TOOLS) expect(all).toContain(`tool:${tool.id}`);
		for (const tool of MORE_TOOLS.flatMap((item) => item.items ?? [item])) expect(all).toContain(`more:${tool.value}`);
		for (const value of ['add', 'auto', 'tags', 'voice', 'voice:correct', 'voice:arrange', 'voice:commands', 'undo', 'redo', 'fit', 'post:embed', 'post:picture', 'publish']) expect(all).toContain(value);
		expect(new Set(all).size).toBe(all.length);
	});

	test('leaves out what the table can’t do here', () => {
		const all = values(base);
		for (const value of ['auto', 'tags', 'voice', 'more:media', 'post:embed', 'publish', 'details', 'layout:selection']) expect(all).not.toContain(value);
		expect(all).toContain('layout:table:grid');
	});

	test('what applies to the selection comes first', () => {
		const items = contextItems({ ...full, selection: [{ id: 'a' }, { id: 'b' }], details: 'shown' });
		expect(items.slice(0, 3).map((item) => item.value)).toEqual(['layout:selection', 'details', 'tags']);
		expect(items[0].items?.map((item) => item.value)).toContain('layout:selection:outline');
		expect(items[1].label).toBe('Hide details');
		expect(contextItems({ ...full, selection: [{ id: 'f', type: 'frame' }] })[0].label).toBe('Lay out inside this area');
		expect(values({ ...full, selection: [{ id: 'a' }] })).not.toContain('layout:selection');
	});

	test('mind map mode is a switch where it can be switched, with its keys listed while it is on', () => {
		expect(values(base)).not.toContain('mindmap');
		const off = flat(contextItems({ ...full, mindMap: false }));
		expect(off.find((item) => item.value === 'mindmap')?.checked).toBe(false);
		expect(off.some((item) => item.value === 'mindmap-keys')).toBe(false);
		const on = flat(contextItems({ ...full, mindMap: true }));
		expect(on.find((item) => item.value === 'mindmap')?.checked).toBe(true);
		expect(on.find((item) => item.value === 'mindmap-keys')?.shortcut).toBe('?');
	});

	test('shows what is on: the tool in hand, auto layout and its layout, undo and redo', () => {
		const items = flat(contextItems({ ...full, tool: 'geo', geo: 'star', autoLayout: 'tree', canUndo: true }));
		const by = (value: string) => items.find((item) => item.value === value)!;
		expect(by('more:geo:star').checked).toBe(true);
		expect(by('tool:select').checked).toBeUndefined();
		expect(by('auto').checked).toBe(true);
		expect(by('layout:table:tree').checked).toBe(true);
		expect(by('layout:table:grid').checked).toBe(false);
		expect(by('undo').disabled).toBe(false);
		expect(by('redo').disabled).toBe(true);
		expect(by('voice:correct').checked).toBe(true);
		expect(by('publish').label).toBe('Publish');
	});
});
