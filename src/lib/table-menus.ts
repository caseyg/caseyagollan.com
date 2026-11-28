/**
 * What the table toolbar's menus offer: the layouts of the Layout menu (the same ones the chat's
 * `table_arrange` uses) and tldraw's other tools, kept behind More so the bar stays short.
 */
import type { IconName } from './components/ui/Icon.svelte';
import type { TableArrangement, TableClusterBy, TableOp } from './table-agent';
import { TABLE_POST_CHOICES } from './table-post';

export interface TableMenuItem {
	value: string;
	label: string;
	icon?: IconName;
	detail?: string;
	group?: string;
	/** The key that picks it, as a hint. */
	shortcut?: string;
	/** Picking it leaves the menu open, to pick another and compare. */
	keepOpen?: boolean;
	/** Items that open beside this one. */
	items?: TableMenuItem[];
}

/** What a layout sets out: everything on the table, or only what is selected. */
export type LayoutScope = 'selection' | 'table';

/** The layouts. Picking one leaves its menu open, so several can be tried one after another. */
export const TABLE_LAYOUTS: TableMenuItem[] = ([
	{ value: 'auto', icon: 'sparkle', label: 'Tidy up', detail: 'Picks what suits' },
	{ value: 'grid', icon: 'layout', label: 'Grid', detail: 'Aligned', group: 'Rows and columns' },
	{ value: 'columns', icon: 'layout-columns', label: 'Columns', detail: 'Like a wall of cards', group: 'Rows and columns' },
	{ value: 'pack', icon: 'layout-pack', label: 'Pack', detail: 'Rows of mixed heights', group: 'Rows and columns' },
	{ value: 'row', icon: 'layout-row', label: 'One row', group: 'Rows and columns' },
	{ value: 'column', icon: 'layout-column', label: 'One column', group: 'Rows and columns' },
	{ value: 'tree', icon: 'layout-tree', label: 'Tree', detail: 'Top down', group: 'Following the arrows' },
	{ value: 'outline', icon: 'layout-outline', label: 'Outline', detail: 'Compact, left to right', group: 'Following the arrows' },
	{ value: 'mindmap', icon: 'layout-mindmap', label: 'Mind map', detail: 'Out to both sides', group: 'Following the arrows' },
	{ value: 'radial', icon: 'layout-radial', label: 'Radial', detail: 'In rings', group: 'Following the arrows' },
	{ value: 'layered', icon: 'layout-flow', label: 'Flow', detail: 'Left to right', group: 'Following the arrows' },
	{ value: 'force', icon: 'layout-web', label: 'Web', detail: 'Linked things close', group: 'Following the arrows' },
	{ value: 'cluster:kind', icon: 'layers', label: 'By kind', detail: 'Posts, books, notes…', group: 'In groups' },
	{ value: 'cluster:color', icon: 'palette', label: 'By colour', group: 'In groups' },
	{ value: 'cluster:connected', icon: 'link', label: 'By what’s linked', group: 'In groups' }
] satisfies TableMenuItem[]).map((layout) => ({ ...layout, keepOpen: true }));

type ArrangeOp = Extract<TableOp, { op: 'arrange' }>;

/**
 * The canvas op for a Layout menu choice. A selection of two or more is set out on its own; one
 * selected area has what it holds set out; anything else is the whole table. Groups made here
 * are not framed: a person who wants areas draws them.
 */
export function layoutOp(value: string, scope: LayoutScope, selected: string[]): ArrangeOp | undefined {
	const [layout, by] = value.split(':') as [TableArrangement, TableClusterBy | undefined];
	if (!TABLE_LAYOUTS.some((item) => item.value === value)) return undefined;
	// A layout picked by hand leaves the view alone: the table moves, not what is being looked at.
	return { op: 'arrange', layout, zoom: false, ...(by ? { by, frame: false } : {}), ...(scope === 'selection' && selected.length ? { ids: selected } : {}) };
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
			shape('hexagon', 'Hexagon', 'hexagon'),
			shape('oval', 'Oval', 'oval'),
			shape('rhombus', 'Rhombus', 'rhombus'),
			shape('star', 'Star', 'star'),
			shape('cloud', 'Cloud', 'cloud'),
			shape('heart', 'Heart', 'heart'),
			shape('x-box', 'Crossed box', 'x-box'),
			shape('check-box', 'Checked box', 'check-box'),
			shape('arrow-left', 'Arrow left', 'block-arrow-left'),
			shape('arrow-up', 'Arrow up', 'block-arrow-up'),
			shape('arrow-down', 'Arrow down', 'block-arrow-down'),
			shape('arrow-right', 'Arrow right', 'block-arrow-right')
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

/** The tools the bar shows as buttons. */
export type ToolId = 'select' | 'hand' | 'note' | 'text' | 'draw' | 'arrow' | 'eraser';
export const TOOLS: { id: ToolId; label: string; icon: IconName; key: string }[] = [
	{ id: 'select', label: 'Select', icon: 'pointer', key: 'V' },
	{ id: 'hand', label: 'Pan', icon: 'hand', key: 'H' },
	{ id: 'note', label: 'Note', icon: 'sticky', key: 'N' },
	{ id: 'text', label: 'Text', icon: 'type', key: 'T' },
	{ id: 'draw', label: 'Draw', icon: 'pencil', key: 'D' },
	{ id: 'arrow', label: 'Arrow', icon: 'arrow', key: 'A' },
	{ id: 'eraser', label: 'Eraser', icon: 'eraser', key: 'E' }
];

/** A row of the canvas's right-click menu (`ui/ContextMenu` takes these as they are). */
export interface TableContextItem {
	value: string;
	label: string;
	hint?: string;
	icon?: IconName;
	group?: string;
	checked?: boolean;
	shortcut?: string;
	disabled?: boolean;
	keepOpen?: boolean;
	items?: TableContextItem[];
}

/** What the right-click menu needs to know of the table; what is left out isn't offered. */
export interface TableContextState {
	selection: { id: string; type?: string }[];
	tool: string;
	geo?: string;
	canUndo: boolean;
	canRedo: boolean;
	autoLayout?: string;
	/** Whether auto layout can be switched. */
	auto?: boolean;
	/** Whether the table is in mind map mode; left out, the mode can't be switched from here. */
	mindMap?: boolean;
	/** Whether the selected blocks show their details. */
	details?: 'shown' | 'hidden' | 'mixed';
	tags?: boolean;
	/** Pictures and videos can be added from this device. */
	media?: boolean;
	voice?: { status: 'off' | 'starting' | 'listening'; correct: boolean; arrange: boolean; commands?: boolean };
	/** Whether visitors can see the table; left out, it can't be published from here. */
	published?: boolean;
	post?: boolean;
}

/**
 * The canvas's right-click menu: everything the toolbar does, by the same names. What applies to
 * the selection comes first; layouts for the whole table, the tools and the rest follow.
 * Values: `layout:<scope>:<layout>`, `auto`, `tool:<id>`, `more:<More value>`, `voice[:<choice>]`,
 * `post:<as>`, and `add`, `details`, `tags`, `mindmap`, `mindmap-keys`, `undo`, `redo`, `fit`, `publish`.
 */
export function contextItems(state: TableContextState): TableContextItem[] {
	const scopes = layoutScopes(state.selection);
	const layouts = (scope: LayoutScope): TableContextItem[] =>
		TABLE_LAYOUTS.map(({ value, label, icon, group }) => ({ value: `layout:${scope}:${value}`, label, icon, group, keepOpen: true, ...(scope === 'table' && state.autoLayout === value ? { checked: true } : {}) }));
	const more = (item: TableMenuItem): TableContextItem => ({
		value: `more:${item.value}`,
		label: item.label,
		icon: item.icon,
		group: item.group ?? 'More',
		...(item.shortcut ? { shortcut: item.shortcut } : {}),
		...(item.items ? { items: item.items.map(more) } : moreToolFor(state.tool, state.geo)?.value === item.value ? { checked: true } : {})
	});
	const tools: TableContextItem[] = [
		...TOOLS.map((tool) => ({ value: `tool:${tool.id}`, label: tool.label, icon: tool.icon, shortcut: tool.key, group: 'Tools', ...(state.tool === tool.id ? { checked: true } : {}) })),
		...MORE_TOOLS.filter((item) => state.media || item.value !== 'media').map(more)
	];
	const voice = state.voice;
	const items: TableContextItem[] = [];
	if (scopes.selection) items.push({ value: 'layout:selection', label: scopes.label === 'Inside this area' ? 'Lay out inside this area' : 'Lay out the selection', icon: 'layout', items: layouts('selection') });
	if (state.details) items.push({ value: 'details', label: state.details === 'shown' ? 'Hide details' : 'Show details', icon: 'properties' });
	if (state.tags && state.selection.length) items.push({ value: 'tags', label: 'Tags…', icon: 'hash' });
	items.push(
		{ value: 'add', label: 'Add…', icon: 'plus', group: 'table' },
		{ value: 'layout:table', label: 'Lay out the whole table', icon: 'layout', group: 'table', items: layouts('table') }
	);
	if (state.auto) items.push({ value: 'auto', label: 'Auto layout', hint: 'Again whenever something is added', icon: 'sparkle', checked: !!state.autoLayout, group: 'table' });
	if (state.mindMap !== undefined) items.push({ value: 'mindmap', label: 'Mind map mode', hint: 'Build a tree from the keyboard', icon: 'layout-outline', checked: state.mindMap, group: 'table' });
	if (state.mindMap) items.push({ value: 'mindmap-keys', label: 'Mind map keys', icon: 'properties', shortcut: '?', group: 'table' });
	items.push({ value: 'tools', label: 'Tools', icon: 'shapes', group: 'table', items: tools });
	if (voice) {
		items.push({
			value: 'voice-note',
			label: 'Voice note',
			icon: 'mic',
			group: 'table',
			items: [
				{ value: 'voice', label: voice.status === 'off' ? 'Start listening' : 'Stop listening', icon: 'mic' },
				{ value: 'voice:correct', label: 'Tidy into notes', checked: voice.correct, group: 'choices' },
				{ value: 'voice:arrange', label: 'Lay out and connect', checked: voice.arrange, group: 'choices' },
				...(voice.commands !== undefined ? [{ value: 'voice:commands', label: 'Follow spoken commands', checked: voice.commands, group: 'choices' }] : [])
			]
		});
	}
	if (state.tags && !state.selection.length) items.push({ value: 'tags', label: 'Tags…', icon: 'hash', group: 'table' });
	items.push(
		{ value: 'undo', label: 'Undo', icon: 'undo', disabled: !state.canUndo, group: 'view' },
		{ value: 'redo', label: 'Redo', icon: 'redo', disabled: !state.canRedo, group: 'view' },
		{ value: 'fit', label: 'Fit to screen', icon: 'fit', group: 'view' }
	);
	if (state.post) items.push({ value: 'post', label: 'Post', icon: 'drafts', group: 'publish', items: TABLE_POST_CHOICES.map((choice) => ({ value: `post:${choice.value}`, label: choice.label, hint: choice.value === 'embed' && state.published === false ? 'Readers see it once the table is published' : choice.hint })) });
	if (state.published !== undefined) items.push({ value: 'publish', label: state.published ? 'Unpublish' : 'Publish', icon: 'globe', hint: state.published ? 'Make this a draft only you can see' : 'Let anyone see this table', group: 'publish' });
	return items;
}
