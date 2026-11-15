import { useCallback } from 'react';
import {
	DefaultColorStyle,
	DefaultFontStyle,
	Tldraw,
	createShapeId,
	getSnapshot,
	react,
	type Editor,
	type TLEditorSnapshot,
	type TLEventInfo,
	type TLShapeId
} from 'tldraw';
import 'tldraw/tldraw.css';
import { BLOCK_SHAPE, blockKey, linkBlock, type Block } from '$lib/tables';
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
}

/** What the Svelte page drives the canvas with. */
export interface TableApi {
	/**
	 * Adds blocks with their top-left at a screen point, or around the middle of the view (or beside
	 * the block they were taken from, `near`), in a row or wrapped into `columns`.
	 */
	addBlocks(blocks: Block[], at?: { x: number; y: number }, options?: { columns?: number; select?: boolean; near?: Block }): void;
	setTool(tool: TableTool): void;
	undo(): void;
	redo(): void;
	zoomToFit(): void;
	/** The canvas's document, as saved. */
	document(): unknown;
	/** A picture of the whole table as an SVG document, or null for an empty table. */
	thumbnail(): Promise<string | null>;
	subscribe(listener: (state: TableState) => void): () => void;
}

export interface TableEditorProps {
	/** A saved document (`{ store, schema }`), or null for a new table. */
	document: unknown;
	editable: boolean;
	licenseKey?: string;
	/** Called with the document after each change a person makes. */
	onChange?: (document: unknown) => void;
	onReady?: (api: TableApi) => void;
}

const shapeUtils = [SiteBlockShapeUtil];
const GAP = 24;

/**
 * Where a block added without a drop point goes: the middle of the view, or just right of the block
 * it was taken from, or the nearest free place around there, so it isn't set down on top of another.
 */
function openSpot(editor: Editor, size: { w: number; h: number }, near?: Block): { x: number; y: number } {
	const viewport = editor.getViewportPageBounds();
	const key = near && blockKey(near);
	const source = key ? editor.getCurrentPageShapes().find((shape) => editor.isShapeOfType(shape, BLOCK_SHAPE) && blockKey((shape as SiteBlockShape).props) === key) : undefined;
	const beside = source && editor.getShapePageBounds(source);
	const start = beside ? { x: beside.maxX + GAP, y: beside.minY } : { x: viewport.center.x - size.w / 2, y: viewport.center.y - size.h / 2 };
	const taken = editor.getCurrentPageShapes().map((shape) => editor.getShapePageBounds(shape)).filter((bounds) => bounds !== undefined);
	const free = (x: number, y: number) => !taken.some((b) => x < b.maxX + GAP && x + size.w + GAP > b.minX && y < b.maxY + GAP && y + size.h + GAP > b.minY);
	const step = 40;
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

function apiFor(editor: Editor): TableApi {
	return {
		addBlocks(blocks, at, { columns = blocks.length, select = true, near } = {}) {
			if (!blocks.length) return;
			const origin = at ? editor.screenToPage(at) : openSpot(editor, blockProps(blocks[0]), near);
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
			if (!at && added && !editor.getViewportPageBounds().contains(added)) editor.centerOnPoint(added.center, { animation: { duration: 220 } });
		},
		setTool: (tool) => editor.setCurrentTool(tool),
		undo: () => editor.undo(),
		redo: () => editor.redo(),
		zoomToFit: () => editor.zoomToFit({ animation: { duration: 220 } }),
		document: () => getSnapshot(editor.store).document,
		async thumbnail() {
			const ids = [...editor.getCurrentPageShapeIds()];
			if (!ids.length) return null;
			const result = await editor.getSvgString(ids, { background: false, darkMode: true, padding: 24 });
			// Embedded fonts would make the picture hundreds of kilobytes; it falls back to the system's.
			return result ? result.svg.replace(/@font-face\s*\{[^}]*\}/g, '') : null;
		},
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
					selected: only && editor.isShapeOfType(only, BLOCK_SHAPE) ? blockOf((only as SiteBlockShape).props) : undefined
				});
			});
		}
	};
}

/** A table's canvas: tldraw without its own interface, drawn in the site's colours. */
export function TableEditor({ document, editable, licenseKey, onChange, onReady }: TableEditorProps) {
	const onMount = useCallback(
		(editor: Editor) => {
			editor.user.updateUserPreferences({ colorScheme: 'dark' });
			editor.updateInstanceState({ isGridMode: false });
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
			return () => {
				stop();
				editor.off('event', offEvent);
			};
		},
		[editable, onChange, onReady]
	);

	const snapshot = document ? ({ document } as unknown as TLEditorSnapshot) : undefined;
	return <Tldraw hideUi shapeUtils={shapeUtils} snapshot={snapshot} licenseKey={licenseKey} onMount={onMount} />;
}
