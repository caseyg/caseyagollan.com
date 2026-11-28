/**
 * What the table toolbar's menus offer: the layouts of the Layout menu (the same ones the chat's
 * `table_arrange` uses) and tldraw's other tools, kept behind More so the bar stays short.
 */
import type { IconName } from './components/ui/Icon.svelte';
import type { TableArrangement, TableClusterBy, TableOp } from './table-agent';

export interface TableMenuItem {
	value: string;
	label: string;
	icon?: IconName;
	detail?: string;
	group?: string;
	/** The key that picks it, as a hint. */
	shortcut?: string;
	/** Items that open beside this one. */
	items?: TableMenuItem[];
}

/** What a layout sets out: everything on the table, or only what is selected. */
export type LayoutScope = 'selection' | 'table';

export const TABLE_LAYOUTS: TableMenuItem[] = [
	{ value: 'auto', label: 'Tidy up', detail: 'Picks what suits' },
	{ value: 'grid', label: 'Grid', detail: 'Aligned', group: 'Rows and columns' },
	{ value: 'columns', label: 'Columns', detail: 'Like a wall of cards', group: 'Rows and columns' },
	{ value: 'pack', label: 'Pack', detail: 'Rows of mixed heights', group: 'Rows and columns' },
	{ value: 'row', label: 'One row', group: 'Rows and columns' },
	{ value: 'column', label: 'One column', group: 'Rows and columns' },
	{ value: 'tree', label: 'Tree', detail: 'Top down', group: 'Following the arrows' },
	{ value: 'mindmap', label: 'Mind map', detail: 'Out to both sides', group: 'Following the arrows' },
	{ value: 'radial', label: 'Radial', detail: 'In rings', group: 'Following the arrows' },
	{ value: 'layered', label: 'Flow', detail: 'Left to right', group: 'Following the arrows' },
	{ value: 'force', label: 'Web', detail: 'Linked things close', group: 'Following the arrows' },
	{ value: 'cluster:kind', label: 'By kind', detail: 'Posts, books, notes…', group: 'In groups' },
	{ value: 'cluster:color', label: 'By colour', group: 'In groups' },
	{ value: 'cluster:connected', label: 'By what’s linked', group: 'In groups' }
];

type ArrangeOp = Extract<TableOp, { op: 'arrange' }>;

/**
 * The canvas op for a Layout menu choice. A selection of two or more is set out on its own; one
 * selected area has what it holds set out; anything else is the whole table. Groups made here
 * are not framed: a person who wants areas draws them.
 */
export function layoutOp(value: string, scope: LayoutScope, selected: string[]): ArrangeOp | undefined {
	const [layout, by] = value.split(':') as [TableArrangement, TableClusterBy | undefined];
	if (!TABLE_LAYOUTS.some((item) => item.value === value)) return undefined;
	return { op: 'arrange', layout, ...(by ? { by, frame: false } : {}), ...(scope === 'selection' && selected.length ? { ids: selected } : {}) };
}

/** Whether a selection can be laid out on its own: several things, or one area (for what it holds). */
export function layoutScopes(selection: { type?: string }[]): { selection: boolean; label: string } {
	if (selection.length === 1 && selection[0].type === 'frame') return { selection: true, label: 'Inside this area' };
	if (selection.length > 1) return { selection: true, label: `${selection.length} selected` };
	return { selection: false, label: '' };
}

/** tldraw's shapes, by the name its geo style gives them. */
const shape = (geo: string, label: string, icon?: IconName): TableMenuItem => ({ value: `geo:${geo}`, label, ...(icon ? { icon } : {}) });

/** The tools of tldraw's own toolbar that the bar doesn't show: under More. */
export const MORE_TOOLS: TableMenuItem[] = [
	{ value: 'frame', label: 'Area', icon: 'frame', shortcut: 'F', detail: 'Holds things' },
	{ value: 'media', label: 'Picture or video…', icon: 'image', detail: 'From this device' },
	{ ...shape('rectangle', 'Rectangle', 'square'), shortcut: 'R', group: 'Shapes' },
	{ ...shape('ellipse', 'Ellipse', 'circle'), shortcut: 'O', group: 'Shapes' },
	{ ...shape('triangle', 'Triangle', 'triangle'), group: 'Shapes' },
	{ ...shape('diamond', 'Diamond', 'diamond'), group: 'Shapes' },
	{
		value: 'shapes',
		label: 'More shapes',
		icon: 'shapes',
		group: 'Shapes',
		items: [
			shape('hexagon', 'Hexagon'),
			shape('oval', 'Oval'),
			shape('rhombus', 'Rhombus'),
			shape('star', 'Star'),
			shape('cloud', 'Cloud'),
			shape('heart', 'Heart'),
			shape('x-box', 'Crossed box'),
			shape('check-box', 'Checked box'),
			shape('arrow-left', 'Arrow left'),
			shape('arrow-up', 'Arrow up'),
			shape('arrow-down', 'Arrow down'),
			shape('arrow-right', 'Arrow right')
		]
	},
	{ value: 'line', label: 'Line', icon: 'line', shortcut: 'L', group: 'Marks' },
	{ value: 'highlight', label: 'Highlighter', icon: 'highlighter', shortcut: '⇧D', group: 'Marks' },
	{ value: 'laser', label: 'Laser pointer', icon: 'laser', shortcut: 'K', detail: 'Not saved', group: 'Marks' }
];

/** A More choice as the canvas takes it: a tldraw tool id, and the shape for its geo tool. */
export function toolChoice(value: string): { tool: string; geo?: string } | undefined {
	if (value.startsWith('geo:')) return { tool: 'geo', geo: value.slice(4) };
	return value === 'media' || value === 'shapes' ? undefined : { tool: value };
}

/** The More item for the tool in hand, if it is one of them, so the button can show it. */
export function moreToolFor(tool: string, geo?: string): TableMenuItem | undefined {
	const value = tool === 'geo' ? `geo:${geo ?? 'rectangle'}` : tool;
	return MORE_TOOLS.flatMap((item) => [item, ...(item.items ?? [])]).find((item) => item.value === value && !item.items);
}

/** Where a table keeps its auto layout, in its document's `meta`: the Layout menu value to lay out again as, or nothing when off. */
export const AUTO_LAYOUT = 'autoLayout';

/** The layout a document's meta asks to be kept in, if it is one the menu knows. */
export function autoLayoutOf(meta: Record<string, unknown> | undefined): string | undefined {
	const value = meta?.[AUTO_LAYOUT];
	return typeof value === 'string' && TABLE_LAYOUTS.some((item) => item.value === value) ? value : undefined;
}
