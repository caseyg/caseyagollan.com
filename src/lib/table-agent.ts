/**
 * The chat assistant's hands on a table. Each table has one chat thread; when Casey asks it
 * to change the table, the thread sends an operation to Casey's open table page, which
 * does it on the canvas (so it animates, saves and undoes like any edit) and answers.
 * Shared by the thread (server) and the table page (browser).
 */
import type { Block } from './tables';

/** Where something goes on the table, in canvas units (the dot grid is 20). */
export interface TablePoint { x: number; y: number }

/**
 * `grid`: columns as wide as their widest item, rows as tall as their tallest. `columns`:
 * masonry, each item into the shortest column (best for notes and text of different
 * lengths). `row`, `column`: one line. `pack`: as tight as possible, order not kept.
 */
export type TableLayout = 'grid' | 'columns' | 'row' | 'column' | 'pack';
export const TABLE_LAYOUTS: readonly TableLayout[] = ['grid', 'columns', 'row', 'column', 'pack'];

export type TableAlign = 'left' | 'center-horizontal' | 'right' | 'top' | 'center-vertical' | 'bottom';
export const TABLE_ALIGNS: readonly TableAlign[] = ['left', 'center-horizontal', 'right', 'top', 'center-vertical', 'bottom'];

/** Where a new note goes: a point, or just below or right of an item already there. */
export interface TablePlace { at?: TablePoint; below?: string; right_of?: string }

export type TableOp =
	| { op: 'add_from_search'; query: string; filter?: 'all' | 'post' | 'book' | 'wiki' | 'arena' | 'raindrop'; limit?: number; columns?: number; at?: TablePoint }
	| { op: 'add_links'; urls: string[]; columns?: number; at?: TablePoint }
	| { op: 'add_blocks'; blocks: Block[]; columns?: number; at?: TablePoint }
	| ({ op: 'add_note'; text: string; style?: 'note' | 'text'; w?: number } & TablePlace)
	| { op: 'move'; moves: ({ id: string } & Partial<TablePoint> & { w?: number; h?: number })[] }
	| { op: 'arrange'; layout: TableLayout; ids?: string[]; columns?: number; gap?: number; at?: TablePoint }
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

/** The tools only Casey's runs may use: every change, and `table_look`, which draws on Casey's open page. */
export const TABLE_OWNER_TOOLS = ['table_add_from_search', 'table_add_links', 'table_add_note', 'table_move', 'table_arrange', 'table_align', 'table_tidy', 'table_look', 'table_remove', 'table_select', 'table_rename'] as const;

/** What is on a saved table, from its tldraw document, for when no canvas is open to ask. */
export function itemsFromDocument(document: unknown): TableItem[] {
	const store = (document as { store?: Record<string, unknown> } | null)?.store;
	if (!store || typeof store !== 'object') return [];
	const items: TableItem[] = [];
	for (const record of Object.values(store)) {
		const shape = record as { typeName?: string; id?: string; type?: string; x?: number; y?: number; props?: Record<string, unknown> } | null;
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
		const text = block ? props.excerpt : plainText(props.richText);
		if (typeof text === 'string' && text) item.text = text.slice(0, block ? 200 : 400);
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
