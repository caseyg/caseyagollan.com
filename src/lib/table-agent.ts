/**
 * The chat assistant's hands on a table. Each table has one chat thread; when Casey asks it
 * to change the table, the thread sends an operation to Casey's open table page, which
 * does it on the canvas (so it animates, saves and undoes like any edit) and answers.
 * Shared by the thread (server) and the table page (browser).
 */
import type { Block } from './tables';
import type { PieceChoice } from './table-pieces';

/** Where something goes on the table, in canvas units (the dot grid is 20). */
export interface TablePoint { x: number; y: number }

/**
 * `grid`: columns as wide as their widest item, rows as tall as their tallest. `columns`:
 * masonry, each item into the shortest column (best for notes and text of different
 * lengths). `row`, `column`: one line. `pack`: as tight as possible, order not kept.
 */
export type TableLayout = 'grid' | 'columns' | 'row' | 'column' | 'pack';
export const TABLE_LAYOUTS: readonly TableLayout[] = ['grid', 'columns', 'row', 'column', 'pack'];

/**
 * Every way `arrange` sets out what is already there (`src/lib/table-arrange.ts`). `auto` picks
 * from what is there: a tree or layers when arrows join things, else a grid (masonry columns
 * when heights differ). `tree`: an org chart, parents over children. `mindmap`: one item in
 * the middle, branches to both sides. `radial`: one in the middle, the rest in rings.
 * `layered`: a flow in ranks, for arrows that merge or loop. `force`: joined things pulled
 * together, staying near where they were. `cluster`: named groups, each a small grid.
 */
export type TableArrangement = TableLayout | 'auto' | 'tree' | 'mindmap' | 'radial' | 'layered' | 'force' | 'cluster';
export const TABLE_ARRANGEMENTS: readonly TableArrangement[] = ['auto', 'grid', 'columns', 'row', 'column', 'pack', 'tree', 'mindmap', 'radial', 'layered', 'force', 'cluster'];
/** Which way a tree or flow grows. */
export type TableDirection = 'down' | 'right' | 'up' | 'left';
export const TABLE_DIRECTIONS: readonly TableDirection[] = ['down', 'right', 'up', 'left'];
/** A group for `cluster`: its items, and the name its frame gets. */
export interface TableCluster { name?: string; ids: string[] }
export type TableClusterBy = 'kind' | 'color' | 'connected';

export type TableAlign = 'left' | 'center-horizontal' | 'right' | 'top' | 'center-vertical' | 'bottom';
export const TABLE_ALIGNS: readonly TableAlign[] = ['left', 'center-horizontal', 'right', 'top', 'center-vertical', 'bottom'];

/** tldraw's colours, as its style panel names them. */
export const TABLE_COLORS = ['white', 'grey', 'black', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow', 'orange', 'green', 'light-green', 'light-red', 'red'] as const;
export type TableColor = (typeof TABLE_COLORS)[number];

/** An arrow between two items, bound to both so it follows them when they move. */
export interface TableLink { from: string; to: string; label?: string; color?: TableColor; bend?: number; kind?: 'arc' | 'elbow'; dash?: 'draw' | 'solid' | 'dashed' | 'dotted'; both_ends?: boolean }

/** A pen stroke: points on the page (a line is two), or a loop drawn around an item. */
export interface TableStroke { points?: TablePoint[]; around?: string; closed?: boolean; color?: TableColor; size?: 's' | 'm' | 'l' | 'xl' }

/**
 * One note of several: a sticky note, or (style `text`) a wrapped text card `w` wide. `blank`
 * makes nothing and leaves its cell of the layout empty: the corner of a comparison that has
 * headings along the top and down the side.
 */
export interface TableNote { text: string; style?: 'note' | 'text'; w?: number; color?: TableColor; blank?: boolean }

/** Where new or arranged things go: a point, or just below or right of an item already there. */
export interface TablePlace { at?: TablePoint; below?: string; right_of?: string }

export type TableOp =
	| { op: 'add_from_search'; query: string; filter?: 'all' | 'post' | 'book' | 'wiki' | 'arena' | 'raindrop'; limit?: number; columns?: number; at?: TablePoint }
	/** `find`: for a page on this site, words its search finds it by (its title, then its first words), so it's added as the rich block the Add menu gives, not a bare link. */
	| { op: 'add_links'; urls: string[]; find?: Record<string, string[]>; columns?: number; at?: TablePoint }
	| { op: 'add_blocks'; blocks: Block[]; columns?: number; at?: TablePoint }
	/** A block's pictures and best passages, read from its page as the Add menu does, set down beside it. */
	| ({ op: 'add_pieces'; block: string } & PieceChoice)
	| ({ op: 'add_note'; text: string; style?: 'note' | 'text'; w?: number; color?: TableColor } & TablePlace)
	/** Several notes at once, set out together from their measured sizes: a comparison's cells in one change. */
	| ({ op: 'add_notes'; notes: TableNote[]; layout?: TableLayout; columns?: number } & TablePlace)
	| { op: 'connect'; links: TableLink[] }
	| { op: 'draw'; strokes: TableStroke[] }
	| { op: 'frame'; name: string; ids?: string[]; at?: TablePoint; w?: number; h?: number; color?: TableColor }
	| { op: 'group'; ids: string[] }
	| { op: 'ungroup'; ids: string[] }
	| { op: 'edit'; edits: { id: string; text?: string; color?: TableColor }[] }
	| { op: 'move'; moves: ({ id: string } & Partial<TablePoint> & { w?: number; h?: number })[] }
	/**
	 * Sets out what is there. `ids`: just those (a frame alone means what it holds), in that order when
	 * `ordered`; `inside`: what one frame holds, by its id or its name; neither: the whole table, frames moving as one with what they hold. Arrows tied to
	 * items are the graph the tree, mind map, radial, layered and force layouts draw. `cluster` takes
	 * `groups` (or `by`) and frames each named group unless `frame` is false. `arrows`: what becomes of
	 * the arrows among the items in a graph layout (straightened unless told to keep them, or made elbows).
	 */
	| ({ op: 'arrange'; layout: TableArrangement; ids?: string[]; ordered?: boolean; inside?: string; columns?: number; gap?: number; direction?: TableDirection; root?: string; groups?: TableCluster[]; by?: TableClusterBy; frame?: boolean; arrows?: 'keep' | 'straight' | 'elbow' } & TablePlace)
	| { op: 'align'; ids: string[]; align?: TableAlign; distribute?: 'horizontal' | 'vertical' }
	| { op: 'tidy'; ids?: string[] }
	| { op: 'look'; ids?: string[] }
	| { op: 'remove'; ids: string[] }
	| { op: 'select'; ids: string[]; zoom?: boolean }
	| { op: 'rename'; name: string }
	| { op: 'read' };

/** One thing on the table, as the assistant reads it. */
export interface TableItem {
	id: string;
	/** A block's kind, or `note`, `text`, `arrow`, `draw`, ... */
	type: string;
	title?: string;
	url?: string;
	/** A block's picture, which `view_image` can look at. */
	image?: string;
	text?: string;
	/** An arrow's ends: the ids of the items it joins, when it is tied to them. */
	from?: string;
	to?: string;
	/** The frame or group an item sits in. */
	parent?: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export type TableOpResult = { ok: true; result: unknown } | { ok: false; error: string };

/** What `look` sends back: a picture of the table with each item numbered, and the key to the numbers. */
export interface TableLook {
	/** A JPEG data URL, at most `LOOK_MAX_SIDE` pixels on its long side. */
	image: string;
	width: number;
	height: number;
	/** Item number on the picture, its id, and what it is. */
	key: { n: number; id: string; type: string; title?: string }[];
	issues: import('./table-layout').LayoutIssues;
}
export const LOOK_MAX_SIDE = 1280;

/** Messages between the thread and the table page, beside the chat's own. */
export type TableOpEvent = { type: 'table:op'; id: string } & TableOp;
export type TableOpReply = { type: 'table:result'; id: string } & TableOpResult;
/** The thread stopped waiting for a change it asked for; a page that hasn't made it yet must not. */
export type TableCancelEvent = { type: 'table:cancel'; id: string };

/** The chat thread that belongs to a table: ten lowercase letters and digits, the same everywhere. */
export function tableThreadId(tableId: string): string {
	let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
	for (let index = 0; index < tableId.length; index++) {
		const code = tableId.charCodeAt(index);
		a = Math.imul(a ^ code, 0x01000193) >>> 0;
		b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
	}
	return (a.toString(36).padStart(7, '0').slice(-5) + b.toString(36).padStart(7, '0').slice(-5));
}

/**
 * The tools only Casey's runs may use: every change, and `table_look`, which draws on Casey's
 * open page. Everything but `table_new` needs a table open beside the chat.
 */
export const TABLE_OWNER_TOOLS = ['table_new', 'table_add', 'table_arrange', 'table_move', 'table_connect', 'table_group', 'table_edit', 'table_draw', 'table_select', 'table_look', 'table_pull'] as const;

/** The most items `tableListing` writes out; the rest are counted. */
export const LISTING_MAX = 60;
const LISTING_WORDS = 60;

/**
 * What is on the table, a line per item, for the model to keep in view while it works (as
 * tldraw's own MCP server keeps the canvas in the model's context): it can act on what is there
 * without first asking what is there. Words are clipped; `table_read` with ids gives them whole.
 */
export function tableListing(items: TableItem[], selected: readonly string[] = [], name?: string): string {
	const title = name ? ` “${name.replace(/\s+/g, ' ').slice(0, 80)}”` : '';
	const solid = items.filter((item) => item.type !== 'arrow' && item.type !== 'draw');
	if (!solid.length) return `On the table${title} now: nothing yet.`;
	const chosen = new Set(selected);
	const words = (item: TableItem) => { const all = (item.title ?? item.text ?? '').replace(/\s+/g, ' ').trim(); return all.length > LISTING_WORDS ? `${all.slice(0, LISTING_WORDS).trimEnd()}…` : all; };
	const lines = solid.slice(0, LISTING_MAX).map((item) => `${item.id} ${item.type}${words(item) ? ` “${words(item)}”` : ''} at ${item.x},${item.y} ${item.w}×${item.h}${item.parent ? ` in ${item.parent}` : ''}${chosen.has(item.id) ? ' (selected)' : ''}`);
	const arrows = items.filter((item) => item.type === 'arrow' && item.from && item.to);
	const strokes = items.filter((item) => item.type === 'draw').length;
	return [
		`On the table${title} now, ${solid.length === 1 ? 'one item' : `${solid.length} items`} (id, kind, first words, left,top, width×height, the frame it is in):`,
		...lines,
		...(solid.length > LISTING_MAX ? [`…and ${solid.length - LISTING_MAX} more: table_read lists them all.`] : []),
		...(arrows.length ? [`Arrows: ${arrows.slice(0, 80).map((arrow) => `${arrow.from}→${arrow.to}${arrow.text ? ` “${arrow.text.replace(/\s+/g, ' ').slice(0, 30)}”` : ''}`).join(', ')}${arrows.length > 80 ? `, and ${arrows.length - 80} more` : ''}`] : []),
		...(strokes ? [`Pen strokes: ${strokes}.`] : [])
	].join('\n');
}

/** What is on a saved table, from its tldraw document, for when no canvas is open to ask. */
export function itemsFromDocument(document: unknown): TableItem[] {
	const store = (document as { store?: Record<string, unknown> } | null)?.store;
	if (!store || typeof store !== 'object') return [];
	const items: TableItem[] = [];
	// Arrows tied to items keep their ends in binding records.
	const ends = new Map<string, { from?: string; to?: string }>();
	for (const record of Object.values(store)) {
		const binding = record as { typeName?: string; type?: string; fromId?: string; toId?: string; props?: { terminal?: string } } | null;
		if (binding?.typeName !== 'binding' || binding.type !== 'arrow' || typeof binding.fromId !== 'string' || typeof binding.toId !== 'string') continue;
		const arrow = ends.get(binding.fromId) ?? {};
		arrow[binding.props?.terminal === 'start' ? 'from' : 'to'] = binding.toId.replace(/^shape:/, '');
		ends.set(binding.fromId, arrow);
	}
	for (const record of Object.values(store)) {
		const shape = record as { typeName?: string; id?: string; type?: string; x?: number; y?: number; parentId?: string; props?: Record<string, unknown> } | null;
		if (shape?.typeName !== 'shape' || typeof shape.id !== 'string' || typeof shape.type !== 'string') continue;
		const props = shape.props ?? {};
		const block = shape.type === 'site-block';
		const item: TableItem = {
			id: shape.id.replace(/^shape:/, ''),
			type: block && typeof props.kind === 'string' ? props.kind : shape.type,
			x: Math.round(Number(shape.x) || 0), y: Math.round(Number(shape.y) || 0),
			w: Math.round(Number(props.w) || (shape.type === 'note' ? 200 : 0)), h: Math.round(Number(props.h) || (shape.type === 'note' ? 200 : 0))
		};
		if (block && typeof props.title === 'string') item.title = props.title;
		if (block && typeof props.url === 'string') item.url = props.url;
		if (block && typeof props.image === 'string' && props.image) item.image = props.image;
		const text = block ? props.excerpt : shape.type === 'frame' ? props.name : plainText(props.richText);
		if (typeof text === 'string' && text) item.text = text.slice(0, block ? 200 : 400);
		Object.assign(item, ends.get(shape.id) ?? {});
		if (shape.parentId?.startsWith('shape:')) item.parent = shape.parentId.slice(6);
		items.push(item);
	}
	return items.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The words in a tldraw rich-text (ProseMirror) document. */
function plainText(node: unknown): string {
	if (!node || typeof node !== 'object') return '';
	const { text, content, type } = node as { text?: unknown; content?: unknown[]; type?: string };
	if (typeof text === 'string') return text;
	const inner = Array.isArray(content) ? content.map(plainText) : [];
	return type === 'doc' ? inner.join('\n') : inner.join('');
}
