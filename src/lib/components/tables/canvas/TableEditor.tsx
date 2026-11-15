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
import { BLOCK_SHAPE, linkBlock, type Block } from '$lib/tables';
import { SiteBlockShapeUtil, blockProps, openBlock, type SiteBlockShape } from './SiteBlockShapeUtil';

/** The tools the table's toolbar offers, by tldraw tool id. */
export type TableTool = 'select' | 'hand' | 'note' | 'text' | 'draw' | 'arrow' | 'eraser';

export interface TableState {
	tool: TableTool | string;
	canUndo: boolean;
	canRedo: boolean;
	empty: boolean;
}

/** What the Svelte page drives the canvas with. */
export interface TableApi {
	/**
	 * Adds blocks with their top-left at a screen point, or around the middle of the view, in a row
	 * or wrapped into `columns`.
	 */
	addBlocks(blocks: Block[], at?: { x: number; y: number }, options?: { columns?: number; select?: boolean }): void;
	setTool(tool: TableTool): void;
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
	licenseKey?: string;
	/** Called with the document after each change a person makes. */
	onChange?: (document: unknown) => void;
	onReady?: (api: TableApi) => void;
}

const shapeUtils = [SiteBlockShapeUtil];
const GAP = 24;

/**
 * Where a block added without a drop point goes: the middle of the view, or the nearest free
 * place around it, so it isn't set down on top of another.
 */
function openSpot(editor: Editor, size: { w: number; h: number }): { x: number; y: number } {
	const viewport = editor.getViewportPageBounds();
	const start = { x: viewport.center.x - size.w / 2, y: viewport.center.y - size.h / 2 };
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
		addBlocks(blocks, at, { columns = blocks.length, select = true } = {}) {
			if (!blocks.length) return;
			const origin = at ? editor.screenToPage(at) : openSpot(editor, blockProps(blocks[0]));
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
		},
		setTool: (tool) => editor.setCurrentTool(tool),
		undo: () => editor.undo(),
		redo: () => editor.redo(),
		zoomToFit: () => editor.zoomToFit({ animation: { duration: 220 } }),
		document: () => getSnapshot(editor.store).document,
		subscribe(listener) {
			return react('table state', () => {
				listener({
					tool: editor.getCurrentToolId(),
					canUndo: editor.getCanUndo(),
					canRedo: editor.getCanRedo(),
					empty: editor.getCurrentPageShapeIds().size === 0
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
