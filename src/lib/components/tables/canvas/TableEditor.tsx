import { useCallback } from 'react';
import {
	DefaultColorStyle,
	DefaultFontStyle,
	Tldraw,
	createShapeId,
	getSnapshot,
	react,
	renderPlaintextFromRichText,
	toRichText,
	type Editor,
	type TLEditorSnapshot,
	type TLShape,
	type TLShapePartial,
	type TLEventInfo,
	type TLShapeId
} from 'tldraw';
import 'tldraw/tldraw.css';
import { BLOCK_SHAPE, blockKey, linkBlock, type Block } from '$lib/tables';
import type { TableItem, TableOp } from '$lib/table-agent';
import { SiteBlockShapeUtil, blockOf, blockProps, openBlock, type SiteBlockShape } from './SiteBlockShapeUtil';

/** The tools the table's toolbar offers, by tldraw tool id. */
export type TableTool = 'select' | 'hand' | 'note' | 'text' | 'draw' | 'arrow' | 'eraser';

export interface TableState {
	tool: TableTool | string;
	canUndo: boolean;
	canRedo: boolean;
	empty: boolean;
	/** The blocks on the table, by `blockKey`, so the picker can leave them out. */
	placed: string[];
	/** The block selected on its own, whose page's pieces the picker offers. */
	selected?: Block;
	/** Whether the selected blocks show their details (source line and kind tile); unset when none are selected. */
	details?: 'shown' | 'hidden' | 'mixed';
}

/** What the Svelte page drives the canvas with. */
export interface TableApi {
	/**
	 * Adds blocks with their top-left at a screen point, or around the middle of the view (or beside
	 * the block they were taken from, `near`), in a row or wrapped into `columns`.
	 */
	addBlocks(blocks: Block[], at?: { x: number; y: number }, options?: { columns?: number; select?: boolean; near?: Block; page?: boolean }): string[];
	/** What the chat assistant asks of the canvas (`TableOp`s the canvas itself handles); returns what it reports back. */
	perform(op: Exclude<TableOp, { op: 'add_from_search' | 'add_links' | 'rename' }>): unknown;
	setTool(tool: TableTool): void;
	/** Shows or hides the selected blocks' details, for everyone who sees the table. */
	setDetails(shown: boolean): void;
	undo(): void;
	redo(): void;
	zoomToFit(): void;
	/** The canvas's document, as saved. */
	document(): unknown;
	subscribe(listener: (state: TableState) => void): () => void;
}

export interface TableEditorProps {
	/** A saved document (`{ store, schema }`), or null for a new table. */
	document: unknown;
	editable: boolean;
	/** Framed in a post: scrolling passes to the page, and dragging pans. */
	embedded?: boolean;
	licenseKey?: string;
	/** Called with the document after each change a person makes. */
	onChange?: (document: unknown) => void;
	onReady?: (api: TableApi) => void;
}

const shapeUtils = [SiteBlockShapeUtil];
/** The dot grid's spacing; blocks snap to it, and are set out a grid step apart. */
export const GRID = 20;
const GAP = GRID;
const onGrid = (value: number) => Math.round(value / GRID) * GRID;

/**
 * Where a block added without a drop point goes: the middle of the view, or just right of the block
 * it was taken from, or the nearest free place around there, so it isn't set down on top of another.
 */
function openSpot(editor: Editor, size: { w: number; h: number }, near?: Block): { x: number; y: number } {
	const viewport = editor.getViewportPageBounds();
	const key = near && blockKey(near);
	const source = key ? editor.getCurrentPageShapes().find((shape) => editor.isShapeOfType(shape, BLOCK_SHAPE) && blockKey((shape as SiteBlockShape).props) === key) : undefined;
	const beside = source && editor.getShapePageBounds(source);
	const start = beside ? { x: onGrid(beside.maxX + GAP), y: onGrid(beside.minY) } : { x: onGrid(viewport.center.x - size.w / 2), y: onGrid(viewport.center.y - size.h / 2) };
	const taken = editor.getCurrentPageShapes().map((shape) => editor.getShapePageBounds(shape)).filter((bounds) => bounds !== undefined);
	const free = (x: number, y: number) => !taken.some((b) => x < b.maxX + GAP && x + size.w + GAP > b.minX && y < b.maxY + GAP && y + size.h + GAP > b.minY);
	const step = GRID * 2;
	for (let ring = 0; ring <= 20; ring++) {
		for (let dx = -ring; dx <= ring; dx++) {
			for (let dy = -ring; dy <= ring; dy++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
				const x = start.x + dx * step;
				const y = start.y + dy * step;
				if (free(x, y)) return { x, y };
			}
		}
	}
	return start;
}

const selectedBlocks = (editor: Editor) => editor.getSelectedShapes().filter((shape) => editor.isShapeOfType(shape, BLOCK_SHAPE)) as SiteBlockShape[];

function detailsOf(blocks: SiteBlockShape[]): TableState['details'] {
	if (!blocks.length) return undefined;
	const hidden = blocks.filter((shape) => shape.props.hideMeta).length;
	return hidden === 0 ? 'shown' : hidden === blocks.length ? 'hidden' : 'mixed';
}

function apiFor(editor: Editor): TableApi {
	return {
		addBlocks(blocks, at, { columns = blocks.length, select = true, near, page = false } = {}) {
			if (!blocks.length) return [];
			const dropped = at && (page ? at : editor.screenToPage(at));
			const origin = dropped ? { x: onGrid(dropped.x), y: onGrid(dropped.y) } : openSpot(editor, blockProps(blocks[0]), near);
			const ids: TLShapeId[] = [];
			let x = origin.x;
			let y = origin.y;
			let rowHeight = 0;
			editor.markHistoryStoppingPoint('add blocks');
			editor.run(() => {
				blocks.forEach((block, index) => {
					if (index && index % columns === 0) {
						x = origin.x;
						y += rowHeight + GAP;
						rowHeight = 0;
					}
					const id = createShapeId();
					const props = blockProps(block);
					editor.createShape<SiteBlockShape>({ id, type: BLOCK_SHAPE, x, y, props });
					ids.push(id);
					x += props.w + GAP;
					rowHeight = Math.max(rowHeight, props.h);
				});
			});
			if (select) editor.select(...ids);
			editor.setCurrentTool('select');
			// A block set down out of sight is brought into view.
			const added = editor.getShapePageBounds(ids[0]);
			if ((!at || page) && added && !editor.getViewportPageBounds().contains(added)) editor.centerOnPoint(added.center, { animation: { duration: 220 } });
			return ids;
		},
		perform(op) {
			return performOp(editor, op, this);
		},
		setTool: (tool) => editor.setCurrentTool(tool),
		setDetails(shown) {
			const blocks = selectedBlocks(editor).filter((shape) => shape.props.hideMeta === shown);
			if (!blocks.length) return;
			editor.markHistoryStoppingPoint('toggle details');
			editor.updateShapes(blocks.map((shape) => ({ id: shape.id, type: BLOCK_SHAPE, props: { hideMeta: !shown } })));
		},
		undo: () => editor.undo(),
		redo: () => editor.redo(),
		zoomToFit: () => editor.zoomToFit({ animation: { duration: 220 } }),
		document: () => getSnapshot(editor.store).document,
		subscribe(listener) {
			return react('table state', () => {
				const only = editor.getOnlySelectedShape();
				listener({
					tool: editor.getCurrentToolId(),
					canUndo: editor.getCanUndo(),
					canRedo: editor.getCanRedo(),
					empty: editor.getCurrentPageShapeIds().size === 0,
					placed: editor
						.getCurrentPageShapes()
						.filter((shape) => editor.isShapeOfType(shape, BLOCK_SHAPE))
						.map((shape) => blockKey((shape as SiteBlockShape).props)),
					selected: only && editor.isShapeOfType(only, BLOCK_SHAPE) ? blockOf((only as SiteBlockShape).props) : undefined,
					details: detailsOf(selectedBlocks(editor))
				});
			});
		}
	};
}

const ANIMATION = { animation: { duration: 320 } };

/** The shapes an operation names, by the ids `read` reports; unknown ids are left out. */
function shapesFor(editor: Editor, ids: string[] | undefined): TLShape[] {
	const all = editor.getCurrentPageShapesSorted();
	if (!ids?.length) return all.filter((shape) => shape.type !== 'arrow');
	const wanted = new Set(ids.map((id) => (id.startsWith('shape:') ? id : `shape:${id}`)));
	return all.filter((shape) => wanted.has(shape.id));
}

function itemOf(editor: Editor, shape: TLShape): TableItem {
	const bounds = editor.getShapePageBounds(shape)!;
	const base = { id: shape.id.replace(/^shape:/, ''), x: Math.round(bounds.x), y: Math.round(bounds.y), w: Math.round(bounds.w), h: Math.round(bounds.h) };
	if (editor.isShapeOfType(shape, BLOCK_SHAPE)) {
		const props = (shape as SiteBlockShape).props;
		return { ...base, type: props.kind, title: props.title, url: props.url, ...(props.excerpt ? { text: props.excerpt.slice(0, 200) } : {}) };
	}
	const rich = (shape.props as { richText?: Parameters<typeof renderPlaintextFromRichText>[1] }).richText;
	return { ...base, type: shape.type, ...(rich ? { text: renderPlaintextFromRichText(editor, rich).slice(0, 400) } : {}) };
}

/** Sets shapes out in a grid (or one row, or one column) from a corner, in reading order, a grid step apart. */
function layoutShapes(editor: Editor, shapes: TLShape[], columns: number, at?: { x: number; y: number }) {
	const boxes = shapes.map((shape) => ({ shape, bounds: editor.getShapePageBounds(shape)! })).sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
	if (!boxes.length) return;
	const origin = at ?? { x: Math.min(...boxes.map((box) => box.bounds.x)), y: Math.min(...boxes.map((box) => box.bounds.y)) };
	let x = onGrid(origin.x), y = onGrid(origin.y), rowHeight = 0;
	const updates = boxes.map(({ shape, bounds }, index) => {
		if (index && index % columns === 0) { x = onGrid(origin.x); y += rowHeight + GAP; rowHeight = 0; }
		// A shape's x and y are its rotation origin; move it by how far its bounds must go.
		const update = { id: shape.id, type: shape.type, x: shape.x + (x - bounds.x), y: shape.y + (y - bounds.y) };
		x += onGrid(bounds.w) + GAP;
		rowHeight = Math.max(rowHeight, onGrid(bounds.h));
		return update;
	});
	editor.animateShapes(updates, ANIMATION);
}

function performOp(editor: Editor, op: Parameters<TableApi['perform']>[0], api: TableApi): unknown {
	switch (op.op) {
		case 'read': {
			const shapes = editor.getCurrentPageShapesSorted();
			return { items: shapes.map((shape) => itemOf(editor, shape)), selected: editor.getSelectedShapeIds().map((id) => id.replace(/^shape:/, '')) };
		}
		case 'add_blocks':
			return { added: api.addBlocks(op.blocks, op.at, { columns: op.columns ?? Math.min(op.blocks.length, 4), page: !!op.at }).map((id) => id.replace(/^shape:/, '')) };
		case 'add_note': {
			const id = createShapeId();
			const spot = op.at ?? openSpot(editor, { w: 200, h: 200 });
			editor.markHistoryStoppingPoint('add note');
			editor.createShape({ id, type: 'note', x: onGrid(spot.x), y: onGrid(spot.y), props: { richText: toRichText(op.text.slice(0, 2000)) } });
			return { added: [id.replace(/^shape:/, '')] };
		}
		case 'move': {
			editor.markHistoryStoppingPoint('move');
			const shapes = new Map(shapesFor(editor, op.moves.map((move) => move.id)).map((shape) => [shape.id.replace(/^shape:/, ''), shape]));
			const updates = op.moves.flatMap((move) => {
				const shape = shapes.get(move.id.replace(/^shape:/, ''));
				if (!shape) return [];
				const props = editor.isShapeOfType(shape, BLOCK_SHAPE) && (move.w || move.h) ? { props: { ...(move.w ? { w: onGrid(move.w) } : {}), ...(move.h ? { h: onGrid(move.h) } : {}) } } : {};
				return [{ id: shape.id, type: shape.type, x: move.x === undefined ? shape.x : onGrid(move.x), y: move.y === undefined ? shape.y : onGrid(move.y), ...props } as TLShapePartial];
			});
			editor.animateShapes(updates, ANIMATION);
			return { moved: updates.length };
		}
		case 'arrange': {
			const shapes = shapesFor(editor, op.ids);
			editor.markHistoryStoppingPoint('arrange');
			if (op.layout === 'pack') editor.packShapes(shapes, GAP);
			else layoutShapes(editor, shapes, op.layout === 'row' ? shapes.length : op.layout === 'column' ? 1 : Math.max(1, op.columns ?? Math.ceil(Math.sqrt(shapes.length))), op.at);
			return { arranged: shapes.length };
		}
		case 'remove': {
			const shapes = shapesFor(editor, op.ids);
			if (!op.ids.length) return { removed: 0 };
			editor.markHistoryStoppingPoint('remove');
			editor.deleteShapes(shapes);
			return { removed: shapes.length };
		}
		case 'select': {
			const shapes = shapesFor(editor, op.ids);
			editor.select(...shapes.map((shape) => shape.id));
			if (op.zoom !== false && shapes.length) editor.zoomToSelection({ animation: { duration: 320 } });
			return { selected: shapes.length };
		}
	}
}

/** A table's canvas: tldraw without its own interface, drawn in the site's colours. */
export function TableEditor({ document, editable, embedded = false, licenseKey, onChange, onReady }: TableEditorProps) {
	const onMount = useCallback(
		(editor: Editor) => {
			editor.user.updateUserPreferences({ colorScheme: 'dark' });
			// A dot grid that blocks, notes and drawings snap to, for everyone who sees the table.
			editor.updateInstanceState({ isGridMode: true });
			if (editor.getDocumentSettings().gridSize !== GRID) editor.updateDocumentSettings({ gridSize: GRID });
			// Notes and text read in the site's sans, in white.
			editor.setStyleForNextShapes(DefaultFontStyle, 'sans');
			editor.setStyleForNextShapes(DefaultColorStyle, 'white');
			if (editor.getCurrentPageShapeIds().size) editor.zoomToFit({ animation: { duration: 0 } });
			else editor.resetZoom();

			// Blocks open on double-click through their shape util; a read-only table skips shape
			// double-clicks, so it opens them here.
			const offEvent = (info: TLEventInfo) => {
				if (info.type !== 'click' || info.name !== 'double_click' || info.phase !== 'down' || !editor.getIsReadonly()) return;
				const shape = editor.getShapeAtPoint(editor.screenToPage(info.point), { hitInside: true });
				if (shape && editor.isShapeOfType(shape, BLOCK_SHAPE)) openBlock(shape as SiteBlockShape);
			};
			editor.on('event', offEvent);

			// A pasted or dropped URL becomes a link block, or a site link for this site's pages.
			editor.registerExternalContentHandler('url', ({ url, point }) => {
				const block = linkBlock(url, location.origin);
				if (block) apiFor(editor).addBlocks([block], point ? editor.pageToScreen(point) : undefined);
			});

			const stop = editor.store.listen(() => onChange?.(getSnapshot(editor.store).document), { scope: 'document', source: 'user' });
			onReady?.(apiFor(editor));
			// Read-only once the page has set anything out, so a seeded table can still be shown to visitors.
			editor.updateInstanceState({ isReadonly: !editable });
			if (embedded) {
				editor.setCameraOptions({ wheelBehavior: 'none' });
				editor.setCurrentTool('hand');
			}
			return () => {
				stop();
				editor.off('event', offEvent);
			};
		},
		[editable, embedded, onChange, onReady]
	);

	const snapshot = document ? ({ document } as unknown as TLEditorSnapshot) : undefined;
	return <Tldraw hideUi shapeUtils={shapeUtils} snapshot={snapshot} licenseKey={licenseKey} onMount={onMount} />;
}
