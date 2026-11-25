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
import { LOOK_MAX_SIDE, type TableItem, type TableLook, type TableOp } from '$lib/table-agent';
import { GRID, onGrid, columnLayout, columnsLayout, gridLayout, layoutIssues, rowLayout, tidyLayout, type Box, type Placement } from '$lib/table-layout';
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
	perform(op: Exclude<TableOp, { op: 'add_from_search' | 'add_links' | 'rename' }>): Promise<unknown>;
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
export { GRID };
const GAP = GRID;

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
		return { ...base, type: props.kind, title: props.title, url: props.url, ...(props.excerpt ? { text: props.excerpt.slice(0, 200) } : {}), ...(props.image ? { image: props.image } : {}) };
	}
	const rich = (shape.props as { richText?: Parameters<typeof renderPlaintextFromRichText>[1] }).richText;
	return { ...base, type: shape.type, ...(rich ? { text: renderPlaintextFromRichText(editor, rich).slice(0, 400) } : {}) };
}

/** Shapes that take up room on the table; arrows and drawings run over things by design. */
const SOLID = (shape: TLShape) => !['arrow', 'draw', 'line', 'highlight'].includes(shape.type);

/** Each shape's measured box on the page: a note's height includes how far it grew with its text. */
function boxesOf(editor: Editor, shapes: TLShape[]): Box[] {
	return shapes.flatMap((shape) => {
		const bounds = editor.getShapePageBounds(shape);
		return bounds ? [{ id: shape.id.replace(/^shape:/, ''), x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }] : [];
	});
}

/** Moves shapes so their bounds' top-left lands on each placement, animated. */
function place(editor: Editor, placements: Placement[]) {
	const updates = placements.flatMap(({ id, x, y }) => {
		const shape = editor.getShape(`shape:${id}` as TLShapeId);
		const bounds = shape && editor.getShapePageBounds(shape);
		// A shape's x and y are its rotation origin; move it by how far its bounds must go.
		return shape && bounds ? [{ id: shape.id, type: shape.type, x: shape.x + (x - bounds.x), y: shape.y + (y - bounds.y) }] : [];
	});
	editor.animateShapes(updates, ANIMATION);
	return updates.length;
}

/** What's wrong with the table now, once moves have finished animating. */
async function settled(editor: Editor) {
	await new Promise((resolve) => setTimeout(resolve, ANIMATION.animation.duration + 60));
	return layoutIssues(boxesOf(editor, editor.getCurrentPageShapesSorted().filter(SOLID)));
}

/** What a change reports: what it did, plus any overlaps left, so the assistant can fix them before it answers. */
async function changed(editor: Editor, result: Record<string, unknown>) {
	const issues = await settled(editor);
	const clean = !issues.overlaps.length && !issues.crowded.length;
	return { ...result, ...(clean ? { layout: 'no overlaps' } : { issues }) };
}

/**
 * Where a new note goes: below or right of an item (and on down past anything in the way), at a
 * point, or the nearest open place in view. Measured after it's made, since notes grow with text.
 */
function placeNew(editor: Editor, id: TLShapeId, op: { at?: { x: number; y: number }; below?: string; right_of?: string }) {
	const bounds = editor.getShapePageBounds(id)!;
	const anchorId = op.below ?? op.right_of;
	const anchor = anchorId ? editor.getShapePageBounds(`shape:${anchorId.replace(/^shape:/, '')}` as TLShapeId) : undefined;
	const target = anchor
		? op.below ? { x: anchor.x, y: anchor.maxY + GAP } : { x: anchor.maxX + GAP, y: anchor.y }
		: op.at ?? openSpot(editor, { w: bounds.w, h: bounds.h });
	const shape = editor.getShape(id)!;
	editor.updateShape({ id, type: shape.type, x: onGrid(target.x), y: onGrid(target.y) });
	// Anything it lands on is pushed down (and on down its column), not covered.
	const moves = tidyLayout(boxesOf(editor, editor.getCurrentPageShapesSorted().filter(SOLID)), GAP, id.replace(/^shape:/, ''));
	if (moves.length) place(editor, moves);
}

/** Draws the table to a picture the assistant can look at, each item numbered, overlaps outlined in red. */
async function look(editor: Editor, ids?: string[]): Promise<TableLook | { empty: true }> {
	const shapes = ids?.length ? shapesFor(editor, ids) : editor.getCurrentPageShapesSorted();
	if (!shapes.length) return { empty: true };
	const bounds = editor.getShapesPageBounds(shapes.map((shape) => shape.id))!;
	const padding = 40;
	const scale = Math.min(1.5, LOOK_MAX_SIDE / (Math.max(bounds.w, bounds.h) + padding * 2));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round((bounds.w + padding * 2) * scale);
	canvas.height = Math.round((bounds.h + padding * 2) * scale);
	const context = canvas.getContext('2d')!;
	const toPicture = (x: number, y: number) => ({ x: (x - bounds.x + padding) * scale, y: (y - bounds.y + padding) * scale });
	const solid = shapes.filter(SOLID);
	const boxes = boxesOf(editor, solid);
	const issues = layoutIssues(boxes);

	context.fillStyle = '#2b2b2f';
	context.fillRect(0, 0, canvas.width, canvas.height);
	try {
		// tldraw's own export: blocks drawn by their Svelte cards, notes and text as they look.
		const { blob } = await editor.toImage(shapes, { format: 'png', background: true, darkMode: true, padding, scale, pixelRatio: 1 });
		const bitmap = await createImageBitmap(blob);
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
	} catch {
		// No export (a picture that wouldn't load, say): a plan of the boxes, titled, still shows the layout.
		context.font = `${Math.max(10, 13 * scale)}px sans-serif`;
		for (const shape of solid) {
			const item = itemOf(editor, shape);
			const { x, y } = toPicture(item.x, item.y);
			context.fillStyle = '#44444a';
			context.fillRect(x, y, item.w * scale, item.h * scale);
			context.strokeStyle = '#8a8a92';
			context.strokeRect(x, y, item.w * scale, item.h * scale);
			context.fillStyle = '#fff';
			context.fillText((item.title ?? item.text ?? item.type).slice(0, 40), x + 6, y + 30 * scale, item.w * scale - 12);
		}
	}

	const overlapping = new Set(issues.overlaps.flatMap((overlap) => overlap.ids));
	context.lineWidth = Math.max(2, 3 * scale);
	context.strokeStyle = '#ff3b30';
	for (const box of boxes) {
		if (!overlapping.has(box.id)) continue;
		const { x, y } = toPicture(box.x, box.y);
		context.strokeRect(x, y, box.w * scale, box.h * scale);
	}
	const key: TableLook['key'] = [];
	const radius = Math.max(9, 12 * scale);
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.font = `bold ${Math.round(radius * 1.1)}px sans-serif`;
	solid.forEach((shape, index) => {
		const item = itemOf(editor, shape);
		key.push({ n: index + 1, id: item.id, type: item.type, ...(item.title ? { title: item.title.slice(0, 80) } : item.text ? { title: item.text.slice(0, 60) } : {}) });
		const { x, y } = toPicture(item.x, item.y);
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.fillStyle = overlapping.has(item.id) ? '#ff3b30' : '#ffd60a';
		context.fill();
		context.fillStyle = '#000';
		context.fillText(String(index + 1), x, y + 1);
	});
	return { image: canvas.toDataURL('image/jpeg', 0.72), width: canvas.width, height: canvas.height, key, issues };
}

async function performOp(editor: Editor, op: Parameters<TableApi['perform']>[0], api: TableApi): Promise<unknown> {
	switch (op.op) {
		case 'read': {
			const shapes = editor.getCurrentPageShapesSorted();
			return { items: shapes.map((shape) => itemOf(editor, shape)), selected: editor.getSelectedShapeIds().map((id) => id.replace(/^shape:/, '')), issues: layoutIssues(boxesOf(editor, shapes.filter(SOLID))) };
		}
		case 'look':
			return look(editor, op.ids);
		case 'add_blocks':
			return changed(editor, { added: api.addBlocks(op.blocks, op.at, { columns: op.columns ?? Math.min(op.blocks.length, 4), page: !!op.at }).map((id) => id.replace(/^shape:/, '')) });
		case 'add_note': {
			const id = createShapeId();
			const text = toRichText(op.text.slice(0, 2000));
			editor.markHistoryStoppingPoint('add note');
			// Long text reads better as a wrapped text card than a sticky note, which shrinks its type to fit.
			if (op.style === 'text') editor.createShape({ id, type: 'text', x: 0, y: 0, props: { richText: text, autoSize: false, w: Math.max(160, Math.min(800, op.w ?? 360)) } });
			else editor.createShape({ id, type: 'note', x: 0, y: 0, props: { richText: text } });
			placeNew(editor, id, op);
			const report = await changed(editor, {});
			const bounds = editor.getShapePageBounds(id)!;
			return { added: [{ id: id.replace(/^shape:/, ''), x: Math.round(bounds.x), y: Math.round(bounds.y), w: Math.round(bounds.w), h: Math.round(bounds.h) }], ...report };
		}
		case 'move': {
			editor.markHistoryStoppingPoint('move');
			const shapes = new Map(shapesFor(editor, op.moves.map((move) => move.id)).map((shape) => [shape.id.replace(/^shape:/, ''), shape]));
			const updates = op.moves.flatMap((move) => {
				const shape = shapes.get(move.id.replace(/^shape:/, ''));
				if (!shape) return [];
				const resizable = editor.isShapeOfType(shape, BLOCK_SHAPE) || shape.type === 'text';
				const props = resizable && (move.w || move.h) ? { props: { ...(move.w ? { w: onGrid(move.w) } : {}), ...(move.h && shape.type !== 'text' ? { h: onGrid(move.h) } : {}), ...(shape.type === 'text' ? { autoSize: false } : {}) } } : {};
				return [{ id: shape.id, type: shape.type, x: move.x === undefined ? shape.x : onGrid(move.x), y: move.y === undefined ? shape.y : onGrid(move.y), ...props } as TLShapePartial];
			});
			editor.animateShapes(updates, ANIMATION);
			return changed(editor, { moved: updates.length });
		}
		case 'arrange': {
			const shapes = shapesFor(editor, op.ids).filter(SOLID);
			editor.markHistoryStoppingPoint('arrange');
			const gap = Math.max(0, Math.min(200, op.gap ?? GAP));
			const boxes = boxesOf(editor, shapes);
			const columns = Math.max(1, op.columns ?? Math.ceil(Math.sqrt(shapes.length)));
			if (op.layout === 'pack') editor.packShapes(shapes, gap);
			else place(editor, op.layout === 'row' ? rowLayout(boxes, op.at, gap) : op.layout === 'column' ? columnLayout(boxes, op.at, gap) : op.layout === 'columns' ? columnsLayout(boxes, columns, op.at, gap) : gridLayout(boxes, columns, op.at, gap));
			return changed(editor, { arranged: shapes.length });
		}
		case 'align': {
			const shapes = shapesFor(editor, op.ids).filter(SOLID);
			if (shapes.length < 2) return { aligned: 0, note: 'Name at least two items.' };
			editor.markHistoryStoppingPoint('align');
			if (op.align) editor.alignShapes(shapes, op.align);
			if (op.distribute && shapes.length > 2) editor.distributeShapes(shapes, op.distribute);
			return changed(editor, { aligned: shapes.length });
		}
		case 'tidy': {
			const shapes = shapesFor(editor, op.ids).filter(SOLID);
			editor.markHistoryStoppingPoint('tidy');
			return changed(editor, { moved: place(editor, tidyLayout(boxesOf(editor, shapes))) });
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
