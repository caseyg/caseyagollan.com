import { describe, expect, test } from 'bun:test';
import { TABLE_ARRANGEMENTS } from '../src/lib/table-agent';
import { AUTO_LAYOUT, autoLayoutOf, layoutOp, layoutScopes, MORE_TOOLS, moreToolFor, TABLE_LAYOUTS, toolChoice } from '../src/lib/table-menus';

describe('the Layout menu', () => {
	test('offers every layout the chat can use', () => {
		const offered = new Set(TABLE_LAYOUTS.map((item) => item.value.split(':')[0]));
		for (const layout of TABLE_ARRANGEMENTS) expect(offered.has(layout)).toBe(true);
		expect(new Set(TABLE_LAYOUTS.map((item) => item.value)).size).toBe(TABLE_LAYOUTS.length);
	});

	test('lays out the whole table, or only what is selected', () => {
		expect(layoutOp('tree', 'table', ['a', 'b'])).toEqual({ op: 'arrange', layout: 'tree' });
		expect(layoutOp('tree', 'selection', ['a', 'b'])).toEqual({ op: 'arrange', layout: 'tree', ids: ['a', 'b'] });
		expect(layoutOp('grid', 'selection', [])).toEqual({ op: 'arrange', layout: 'grid' });
		expect(layoutOp('nonsense', 'table', [])).toBeUndefined();
	});

	test('groups are made without drawing areas around them', () => {
		expect(layoutOp('cluster:color', 'table', [])).toEqual({ op: 'arrange', layout: 'cluster', by: 'color', frame: false });
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
