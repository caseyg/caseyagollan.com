import { useCallback } from 'react';
import {
	defaultHandleExternalTextContent,
	DefaultColorStyle,
	DefaultFontStyle,
	GeoShapeGeoStyle,
	Tldraw,
	b64Vecs,
	createShapeId,
	fitFrameToContent,
	getArrowBindings,
	getSnapshot,
	react,
	renderPlaintextFromRichText,
	toRichText,
	type Editor,
	type TLArrowShape,
	type TLAssetId,
	type TLEditorSnapshot,
	type TLShape,
	type TLBindingUpdate,
	type TLShapePartial,
	type TLEventInfo,
	type TLGeoShapeGeoStyle,
	type TLShapeId
} from 'tldraw';
import 'tldraw/tldraw.css';
import { BLOCK_SHAPE, blockKey, type Block } from '$lib/tables';
import { linkedBlock, richerBlock } from '$lib/table-sources';
import type { ChatSelectionItem } from '$lib/chat';
import type { LikeThing } from '$lib/table-feed';
import { TABLE_PICTURE_MAX_SIDE } from '$lib/table-post';
import { LOOK_MAX_SIDE, type TableItem, type TableLayout, type TableLink, type TableLook, type TableMapCard, type TableMapLink, type TableNote, type TableOp, type TablePlace, type TableStroke } from '$lib/table-agent';
import { AUTO_LAYOUT, autoLayoutOf, layoutOp } from '$lib/table-menus';
import { MIND_MAP, mindMapOf } from '$lib/table-mindmap';
import { arrange, clustersBy, labelIssues, routeArrows, usesArrows, type ArrangeResult, type Edge } from '$lib/table-arrange';
import { GRID, onGrid, arrowCrossings, columnLayout, columnsLayout, gridLayout, layoutIssues, rowLayout, tidyLayout, type Box, type Placement } from '$lib/table-layout';
import { tagRef } from '$lib/tag-edits';
import { SiteBlockShapeUtil, blockOf, blockProps, fitsToPost, openBlock, type SiteBlockShape } from './SiteBlockShapeUtil';
import { addMarkdownTree, installTextBlocks, reveal, voiceCanvas, type VoiceCanvas } from './textBlocks';
import { installMindMap } from './mindMap';
import { isMarkdownFile, looksLikeMarkdown } from '$lib/markdown-tree';
import { markdownRich, richMarkdown, type RichDoc } from '$lib/voice-notes';

/** The tools the table's toolbar offers, by tldraw tool id. */
export type TableTool = 'select' | 'hand' | 'note' | 'text' | 'draw' | 'arrow' | 'eraser' | 'frame' | 'geo' | 'line' | 'highlight' | 'laser';

export interface TableState {
	tool: TableTool | string;
	/** The shape the geo tool draws next (`rectangle`, `ellipse`…). */
	geo?: string;
	/** The layout the table is kept in as things are added (a Layout menu value); unset when auto layout is off. */
	autoLayout?: string;
	/** Mind map mode: the keyboard builds and walks a tree, set out as an outline after each change. */
	mindMap: boolean;
	canUndo: boolean;
	canRedo: boolean;
	empty: boolean;
	/** The blocks on the table, by `blockKey`, so the picker can leave them out. */
	placed: string[];
	/** The block selected on its own, whose page's pieces the picker offers. */
	selected?: Block;
	/** Whether the selected blocks show their details (source line and kind tile); unset when none are selected. */
	details?: 'shown' | 'hidden' | 'mixed';
	/** Everything selected, briefly (id, kind, title or first words), for the chat to act on. */
	selection: ChatSelectionItem[];
	/** Every block whose tags can be read and changed (`tagRef`), in reading order, with whether it is selected. */
	taggable: TaggableBlock[];
}

/** A block with tags somewhere: one of the site's posts, a Raindrop bookmark, something in Readwise. */
export interface TaggableBlock {
	/** Its id on the table, without `shape:`. */
	id: string;
	ref: string;
	title: string;
	selected: boolean;
	/** Whether its details show; tags are details. */
	details: boolean;
}

/** What the Svelte page drives the canvas with. */
export interface TableApi {
	/**
	 * Adds blocks with their top-left at a screen point, or around the middle of the view (or beside
	 * the block they were taken from, `near`), in a row or wrapped into `columns`. `sizes` gives a block
	 * its own size (a rendered page is as tall as its picture); `plain` sets them down with details hidden.
	 * `linkFrom` (ids of things on the table) draws an arrow to each new block from what it was found by:
	 * from the one thing, or from an area put around several.
	 */
	addBlocks(blocks: Block[], at?: { x: number; y: number }, options?: { columns?: number; select?: boolean; near?: Block; page?: boolean; sizes?: ({ w: number; h: number } | null | undefined)[]; plain?: boolean; linkFrom?: string[] }): string[];
	/** What the chat assistant asks of the canvas (`TableOp`s the canvas itself handles); returns what it reports back. */
	perform(op: Exclude<TableOp, { op: 'add_from_search' | 'add_links' | 'add_pieces' | 'add_pdf_pages' | 'relink' | 'rename' | 'tag' }>): Promise<unknown>;
	/** What a voice note writes with: blocks whose words arrive as they are heard (`$lib/voice-session.svelte`). */
	voice: VoiceCanvas;
	/** Takes up a tool; `geo` is the shape the geo tool draws. */
	setTool(tool: TableTool, geo?: string): void;
	/** Sets pictures or videos from this device down in the middle of the view. */
	addMedia(files: File[]): Promise<void>;
	/** Sets Markdown down as a tree of text blocks (`addMarkdownTree`), at a place on the page or where there is room. Resolves with the blocks' ids. */
	addMarkdown(markdown: string, at?: { x: number; y: number }): Promise<string[]>;
	/**
	 * Auto layout: keeps the whole table in this layout (a Layout menu value), laying it out again
	 * each time something is added; null turns it off. Saved with the table, in its document's meta.
	 */
	setAutoLayout(layout: string | null): void;
	/**
	 * Mind map mode (`$lib/table-mindmap`, `./mindMap`): while on, the keyboard builds and walks a tree
	 * of text blocks and arrows. Saved with the table, in its document's meta.
	 */
	setMindMap(on: boolean): void;
	/** Shows or hides the selected blocks' details, for everyone who sees the table. */
	setDetails(shown: boolean): void;
	/**
	 * Everything selected, to find the like of: blocks as they are, stickies, text boxes, shapes and
	 * areas by their words, pictures set down from this device by their address.
	 */
	selectedThings(): LikeThing[];
	/** The ids of the same things, in the same order: what blocks added as like them are linked from. */
	selectedIds(): string[];
	/** Clears the selection. */
	deselect(): void;
	undo(): void;
	redo(): void;
	zoomToFit(): void;
	/** The canvas's document, as saved. */
	document(): unknown;
	/** The whole table as a PNG, as it looks now; null when nothing is on it. */
	picture(): Promise<Blob | null>;
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
function openSpot(editor: Editor, size: { w: number; h: number }, near?: Block | TLShapeId, ignore: TLShapeId[] = []): { x: number; y: number } {
	const viewport = editor.getViewportPageBounds();
	const key = near && typeof near !== 'string' && blockKey(near);
	const source = typeof near === 'string' ? editor.getShape(near) : key ? editor.getCurrentPageShapes().find((shape) => editor.isShapeOfType(shape, BLOCK_SHAPE) && blockKey((shape as SiteBlockShape).props) === key) : undefined;
	const beside = source && editor.getShapePageBounds(source);
	const start = beside ? { x: onGrid(beside.maxX + GAP), y: onGrid(beside.minY) } : { x: onGrid(viewport.center.x - size.w / 2), y: onGrid(viewport.center.y - size.h / 2) };
	const taken = editor.getCurrentPageShapes().filter((shape) => !ignore.includes(shape.id)).map((shape) => editor.getShapePageBounds(shape)).filter((bounds) => bounds !== undefined);
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

function taggableBlocks(editor: Editor): TaggableBlock[] {
	const selected = new Set<string>(editor.getSelectedShapeIds());
	const blocks: TaggableBlock[] = [];
	for (const shape of editor.getCurrentPageShapesSorted()) {
		if (!editor.isShapeOfType(shape, BLOCK_SHAPE)) continue;
		const props = (shape as SiteBlockShape).props;
		const ref = tagRef(blockOf(props));
		if (ref) blocks.push({ id: shape.id.replace(/^shape:/, ''), ref, title: (props.kind === 'quote' && props.excerpt ? props.excerpt : props.title).slice(0, 120), selected: selected.has(shape.id), details: !props.hideMeta });
	}
	return blocks;
}

function detailsOf(blocks: SiteBlockShape[]): TableState['details'] {
	if (!blocks.length) return undefined;
	const hidden = blocks.filter((shape) => shape.props.hideMeta).length;
	return hidden === 0 ? 'shown' : hidden === blocks.length ? 'hidden' : 'mixed';
}

/** Whatever a shape lies on is moved down (and on down its column), not covered. */
function pushAside(editor: Editor, id: TLShapeId) {
	const moves = tidyLayout(boxesOf(editor, shapesFor(editor, undefined).filter(SOLID)), GAP, short(id));
	if (moves.length) place(editor, moves);
}

function apiFor(editor: Editor): TableApi {
	const api: TableApi = {
		addBlocks(blocks, at, { columns = blocks.length, select = true, near, page = false, sizes, plain = false, linkFrom } = {}) {
			if (!blocks.length) return [];
			const dropped = at && (page ? at : editor.screenToPage(at));
			const sized = (block: Block, index: number) => ({ ...blockProps(block), ...(sizes?.[index] ? { w: Math.max(40, Math.round(sizes[index]!.w)), h: Math.max(40, Math.round(sizes[index]!.h)) } : {}), ...(plain ? { hideMeta: true } : {}) });
			editor.markHistoryStoppingPoint('add blocks');
			// What the new blocks are linked from is settled first (several things get their area), so they are set down clear of it.
			const anchor = linkFrom?.length ? linkAnchor(editor, linkFrom) : undefined;
			const origin = dropped ? { x: onGrid(dropped.x), y: onGrid(dropped.y) } : openSpot(editor, sized(blocks[0], 0), anchor ?? near);
			const ids: TLShapeId[] = [];
			let x = origin.x;
			let y = origin.y;
			let rowHeight = 0;
			editor.run(() => {
				blocks.forEach((block, index) => {
					if (index && index % columns === 0) {
						x = origin.x;
						y += rowHeight + GAP;
						rowHeight = 0;
					}
					const id = createShapeId();
					const props = sized(block, index);
					editor.createShape<SiteBlockShape>({ id, type: BLOCK_SHAPE, x, y, props, meta: fitsToPost(block) ? { fit: true } : {} });
					ids.push(id);
					x += props.w + GAP;
					rowHeight = Math.max(rowHeight, props.h);
				});
				if (anchor) connect(editor, ids.map((id) => ({ from: short(anchor), to: short(id) })));
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
		voice: voiceCanvas(editor, { openSpot, pushAside, perform: (op) => api.perform(op) }),
		setTool(tool, geo) {
			if (tool === 'geo' && geo) editor.setStyleForNextShapes(GeoShapeGeoStyle, geo as TLGeoShapeGeoStyle);
			editor.setCurrentTool(tool);
		},
		addMarkdown(markdown, at) {
			return addMarkdownTree(editor, { openSpot, perform: (op) => api.perform(op) }, markdown, at);
		},
		async addMedia(files) {
			if (!files.length) return;
			editor.markHistoryStoppingPoint('add media');
			await editor.putExternalContent({ type: 'files', files, point: editor.getViewportPageBounds().center });
			editor.setCurrentTool('select');
		},
		setDetails(shown) {
			const blocks = selectedBlocks(editor).filter((shape) => shape.props.hideMeta === shown);
			if (!blocks.length) return;
			editor.markHistoryStoppingPoint('toggle details');
			editor.updateShapes(blocks.map((shape) => ({ id: shape.id, type: BLOCK_SHAPE, props: { hideMeta: !shown } })));
		},
		setAutoLayout(layout) {
			const { [AUTO_LAYOUT]: _was, ...meta } = editor.getDocumentSettings().meta;
			editor.updateDocumentSettings({ meta: layout ? { ...meta, [AUTO_LAYOUT]: layout } : meta });
		},
		setMindMap(on) {
			const { [MIND_MAP]: _was, ...meta } = editor.getDocumentSettings().meta;
			editor.updateDocumentSettings({ meta: on ? { ...meta, [MIND_MAP]: true } : meta });
			// The keys are the canvas's from here on, not the button's that was pressed.
			if (on) { editor.setCurrentTool('select'); editor.focus(); }
		},
		selectedThings: () => editor.getSelectedShapes().flatMap((shape) => likeThing(editor, shape) ?? []),
		selectedIds: () => editor.getSelectedShapes().filter((shape) => likeThing(editor, shape)).map((shape) => short(shape.id)),
		deselect: () => editor.selectNone(),
		undo: () => editor.undo(),
		redo: () => editor.redo(),
		zoomToFit: () => editor.zoomToFit({ animation: { duration: 220 } }),
		document: () => getSnapshot(editor.store).document,
		async picture() {
			const shapes = editor.getCurrentPageShapesSorted();
			const bounds = shapes.length ? editor.getShapesPageBounds(shapes.map((shape) => shape.id)) : undefined;
			if (!bounds) return null;
			const padding = 48;
			// Sharp on a dense screen, but never larger than a post needs.
			const scale = Math.min(2, TABLE_PICTURE_MAX_SIDE / (Math.max(bounds.w, bounds.h) + padding * 2));
			const { blob, width, height } = await editor.toImage(shapes, { format: 'png', background: false, darkMode: true, padding, scale, pixelRatio: 1 });
			// On the table's own ground, the site's, where tldraw's export would put its dark one.
			const ground = getComputedStyle(editor.getContainer()).getPropertyValue('--tl-color-background').trim();
			if (!ground) return blob;
			const bitmap = await createImageBitmap(blob);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width || Math.round(width);
			canvas.height = bitmap.height || Math.round(height);
			const context = canvas.getContext('2d')!;
			context.fillStyle = ground;
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.drawImage(bitmap, 0, 0);
			bitmap.close();
			return new Promise<Blob | null>((resolve) => canvas.toBlob((drawn) => resolve(drawn ?? blob), 'image/png'));
		},
		subscribe(listener) {
			return react('table state', () => {
				const only = editor.getOnlySelectedShape();
				listener({
					tool: editor.getCurrentToolId(),
					geo: editor.getStyleForNextShape(GeoShapeGeoStyle),
					autoLayout: autoLayoutOf(editor.getDocumentSettings().meta),
					mindMap: mindMapOf(editor.getDocumentSettings().meta),
					canUndo: editor.getCanUndo(),
					canRedo: editor.getCanRedo(),
					empty: editor.getCurrentPageShapeIds().size === 0,
					placed: editor
						.getCurrentPageShapes()
						.filter((shape) => editor.isShapeOfType(shape, BLOCK_SHAPE))
						.map((shape) => blockKey((shape as SiteBlockShape).props)),
					selected: only && editor.isShapeOfType(only, BLOCK_SHAPE) ? blockOf((only as SiteBlockShape).props) : undefined,
					details: detailsOf(selectedBlocks(editor)),
					selection: editor.getSelectedShapes().map((shape) => selectionItem(editor, shape)),
					taggable: taggableBlocks(editor)
				});
			});
		}
	};
	return api;
}

const ANIMATION = { animation: { duration: 320 } };

/** The shapes an operation names, by the ids `read` reports; unknown ids are left out. */
function shapesFor(editor: Editor, ids: string[] | undefined): TLShape[] {
	const all = editor.getCurrentPageShapesSorted();
	// Everything means everything on the table itself: what sits in a frame or group moves with it.
	if (!ids?.length) return all.filter((shape) => shape.type !== 'arrow' && shape.parentId === editor.getCurrentPageId());
	const wanted = new Set(ids.map((id) => (id.startsWith('shape:') ? id : `shape:${id}`)));
	return all.filter((shape) => wanted.has(shape.id));
}

function itemOf(editor: Editor, shape: TLShape): TableItem {
	const bounds = editor.getShapePageBounds(shape)!;
	const base = { id: shape.id.replace(/^shape:/, ''), x: Math.round(bounds.x), y: Math.round(bounds.y), w: Math.round(bounds.w), h: Math.round(bounds.h) };
	const parent = shape.parentId.startsWith('shape:') ? { parent: shape.parentId.slice(6) } : {};
	if (editor.isShapeOfType(shape, BLOCK_SHAPE)) {
		const props = (shape as SiteBlockShape).props;
		return { ...base, ...parent, type: props.kind, title: props.title, url: props.url, ...(props.excerpt ? { text: props.excerpt.slice(0, 200) } : {}), ...(props.image ? { image: props.image } : {}) };
	}
	const rich = (shape.props as { richText?: Parameters<typeof renderPlaintextFromRichText>[1] }).richText;
	// Headings are told with their `#`s, so whoever rewords one can keep it a heading.
	const text = shape.type === 'frame' ? (shape.props as { name: string }).name : rich ? (hasHeading(rich) ? richMarkdown(rich as unknown as RichDoc) : renderPlaintextFromRichText(editor, rich)) : '';
	const ends = shape.type === 'arrow' ? getArrowBindings(editor, shape as TLArrowShape) : undefined;
	return {
		...base, ...parent, type: shape.type, ...(text ? { text: text.slice(0, 400) } : {}),
		...(ends?.start ? { from: ends.start.toId.replace(/^shape:/, '') } : {}), ...(ends?.end ? { to: ends.end.toId.replace(/^shape:/, '') } : {})
	};
}

/** Words written by the chat or a voice note, as a document: a line that begins `#` is a heading (`markdownRich`). */
const written = (text: string) => (/^\s*#{1,6}(\s|$)/m.test(text) ? (markdownRich(text) as unknown as ReturnType<typeof toRichText>) : toRichText(text));
const hasHeading = (rich: unknown) => !!(rich as RichDoc | undefined)?.content?.some((node) => node.type === 'heading');

/** A selected shape as something to find the like of; nothing for a shape with no words or picture (an arrow, a drawing). */
function likeThing(editor: Editor, shape: TLShape): LikeThing | undefined {
	if (editor.isShapeOfType(shape, BLOCK_SHAPE)) return { block: blockOf((shape as SiteBlockShape).props) };
	if (shape.type === 'image') {
		const assetId = (shape.props as { assetId?: string | null }).assetId;
		const src = assetId ? (editor.getAsset(assetId as TLAssetId)?.props as { src?: string | null } | undefined)?.src : undefined;
		// Only a picture with an address of its own; one still held in the page as data has none to read it from.
		return src && /^(https?:\/\/|\/)/.test(src) ? { picture: src } : undefined;
	}
	const rich = (shape.props as { richText?: Parameters<typeof renderPlaintextFromRichText>[1] }).richText;
	const words = (shape.type === 'frame' ? (shape.props as { name: string }).name : rich ? renderPlaintextFromRichText(editor, rich) : '').trim();
	return words && shape.type !== 'arrow' ? { words } : undefined;
}

/** A selected shape as the chat is told of it: enough to name it, not its whole text. */
function selectionItem(editor: Editor, shape: TLShape): ChatSelectionItem {
	const id = shape.id.replace(/^shape:/, '');
	if (editor.isShapeOfType(shape, BLOCK_SHAPE)) {
		const props = (shape as SiteBlockShape).props;
		return { id, type: props.kind, ...(props.title || props.excerpt ? { title: (props.title || props.excerpt).slice(0, 80) } : {}) };
	}
	const rich = (shape.props as { richText?: Parameters<typeof renderPlaintextFromRichText>[1] }).richText;
	const words = (shape.type === 'frame' ? (shape.props as { name: string }).name : rich ? renderPlaintextFromRichText(editor, rich) : '').replace(/\s+/g, ' ').trim();
	return { id, type: shape.type, ...(words ? { title: words.slice(0, 80) } : {}) };
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

/**
 * A distance on the page, as the same distance in a shape's parent: a shape in a frame keeps its
 * x and y from the frame's corner, so a place on the page is reached by moving it, not by setting them.
 */
function inParent(editor: Editor, shape: TLShape, by: { x: number; y: number }) {
	const toParent = editor.getShapeParentTransform(shape).clone().invert();
	const from = toParent.applyToPoint({ x: 0, y: 0 }), to = toParent.applyToPoint(by);
	return { x: to.x - from.x, y: to.y - from.y };
}

/** Of these shapes, the ones not held by another of them: a frame's items move with the frame. */
function outermost<T extends TLShape>(editor: Editor, shapes: T[]): T[] {
	const ids = new Set(shapes.map((shape) => shape.id));
	return shapes.filter((shape) => !editor.getShapeAncestors(shape).some((ancestor) => ids.has(ancestor.id)));
}

/** Moves shapes so their bounds' top-left lands on each placement, animated. */
function place(editor: Editor, placements: Placement[], animate = true) {
	const updates = placements.flatMap(({ id, x, y }) => {
		const shape = editor.getShape(`shape:${id}` as TLShapeId);
		const bounds = shape && editor.getShapePageBounds(shape);
		if (!shape || !bounds) return [];
		// A shape's x and y are its rotation origin; move it by how far its bounds must go.
		const by = inParent(editor, shape, { x: x - bounds.x, y: y - bounds.y });
		return [{ id: shape.id, type: shape.type, x: shape.x + by.x, y: shape.y + by.y }];
	});
	if (animate) editor.animateShapes(updates, ANIMATION);
	else editor.updateShapes(updates);
	return updates.length;
}

/** Room a frame leaves around what it holds. */
const FRAME_PAD = 40;
/** Room a frame's name takes above it, so one set under another doesn't sit on its name. */
const FRAME_LABEL = 40;

/**
 * A frame only draws what lies inside it, so one whose items have moved or grown past its edge
 * hides them. Each such frame is resized to wrap what it holds; its items stay where they are.
 */
export function wrapFrames(editor: Editor) {
	const frames = editor.getCurrentPageShapes().filter((shape) => shape.type === 'frame');
	const loose = frames.filter((frame) => {
		const { w, h } = frame.props as { w: number; h: number };
		return editor.getSortedChildIdsForParent(frame.id).some((id) => {
			const corners = editor.getShapeLocalTransform(id).applyToPoints(editor.getShapeGeometry(id).bounds.corners);
			return corners.some((point) => point.x < -1 || point.y < -1 || point.x > w + 1 || point.y > h + 1);
		});
	});
	if (loose.length) editor.run(() => loose.forEach((frame) => fitFrameToContent(editor, frame.id, { padding: FRAME_PAD })));
	return loose.length;
}

/** What's wrong with the table now, once moves have finished animating. */
async function settled(editor: Editor) {
	await new Promise((resolve) => setTimeout(resolve, ANIMATION.animation.duration + 60));
	followTargets(editor);
	wrapFrames(editor);
	return issuesOf(editor);
}

/** Overlaps, crammed items, and arrows run through cards they don't join. */
function issuesOf(editor: Editor) {
	const shapes = editor.getCurrentPageShapesSorted();
	const boxes = boxesOf(editor, shapes.filter(SOLID));
	const issues = layoutIssues(boxes);
	const ancestors = (id: TLShapeId) => editor.getShapeAncestors(id).map((shape) => short(shape.id));
	const arrows = shapes.filter((shape): shape is TLArrowShape => shape.type === 'arrow').flatMap((arrow) => {
		const ends = getArrowBindings(editor, arrow);
		if (!ends.start || !ends.end) return [];
		const a = editor.getShapePageBounds(ends.start.toId)?.center, b = editor.getShapePageBounds(ends.end.toId)?.center;
		if (!a || !b || arrow.props.kind === 'elbow') return [];
		const skip = [short(ends.start.toId), short(ends.end.toId), ...ancestors(ends.start.toId), ...ancestors(ends.end.toId)];
		// A bent arrow, as two straight runs through the top of its curve (tldraw's bend is how far that is from the chord).
		const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		const top = { x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * arrow.props.bend, y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * arrow.props.bend };
		return Math.abs(arrow.props.bend) < 20 ? [{ id: short(arrow.id), a, b, skip }] : [{ id: short(arrow.id), a, b: top, skip }, { id: short(arrow.id), a: top, b, skip }];
	});
	const seen = new Set<string>();
	const crossings = arrowCrossings(arrows, boxes.filter((box) => editor.getShape(`shape:${box.id}` as TLShapeId)?.type !== 'frame')).filter((pair) => !seen.has(pair.join()) && !!seen.add(pair.join()));
	// Labels that can't be read: under a card, or on another label.
	const cards = boxes.filter((box) => { const type = editor.getShape(`shape:${box.id}` as TLShapeId)?.type; return type !== 'frame' && type !== 'group'; });
	const lines = shapes.filter((shape): shape is TLArrowShape => shape.type === 'arrow').flatMap((arrow) => {
		const ends = getArrowBindings(editor, arrow);
		const from = ends.start && editor.getShapePageBounds(ends.start.toId), to = ends.end && editor.getShapePageBounds(ends.end.toId);
		if (!ends.start || !ends.end || !from || !to) return [];
		const point = (box: typeof from, binding: typeof ends.start) => { const anchor = binding.props.isPrecise ? binding.props.normalizedAnchor : { x: 0.5, y: 0.5 }; return { x: box.x + box.w * anchor.x, y: box.y + box.h * anchor.y }; };
		const box = (id: TLShapeId, bounds: typeof from) => ({ id: short(id), x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h });
		return [{ id: short(arrow.id), a: point(from, ends.start), b: point(to, ends.end), from: box(ends.start.toId, from), to: box(ends.end.toId, to), bend: arrow.props.kind === 'elbow' ? 0 : arrow.props.bend, label: renderPlaintextFromRichText(editor, arrow.props.richText), labelPosition: arrow.props.labelPosition }];
	});
	return { ...issues, ...(crossings.length ? { crossings } : {}), ...labelIssues(cards, lines) };
}

/** A loop drawn around an item (`meta.around`) follows it when the assistant moves it. */
function followTargets(editor: Editor) {
	const updates = editor.getCurrentPageShapes().flatMap((shape) => {
		const { around, center } = shape.meta as { around?: unknown; center?: { x: number; y: number } };
		if (typeof around !== 'string' || !center) return [];
		const box = editor.getShapePageBounds(`shape:${around}` as TLShapeId);
		if (!box) return [];
		const dx = box.center.x - center.x, dy = box.center.y - center.y;
		if (Math.abs(dx) + Math.abs(dy) < 1) return [];
		return [{ id: shape.id, type: shape.type, x: shape.x + dx, y: shape.y + dy, meta: { ...shape.meta, center: { x: box.center.x, y: box.center.y } } }];
	});
	if (updates.length) editor.updateShapes(updates);
}

/** What a change reports: what it did, plus any overlaps left, so the assistant can fix them before it answers. */
async function changed(editor: Editor, result: Record<string, unknown>) {
	const issues = await settled(editor);
	const clean = !issues.overlaps.length && !issues.crowded.length && Object.keys(issues).length === 2;
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
	const moves = tidyLayout(boxesOf(editor, shapesFor(editor, undefined).filter(SOLID)), GAP, id.replace(/^shape:/, ''));
	if (moves.length) place(editor, moves);
}

/** The top-left a place names: just below or right of an item, or a point; undefined when it names neither. */
function originOf(editor: Editor, place: TablePlace): { x: number; y: number } | undefined {
	const anchorId = place.below ?? place.right_of;
	const anchor = anchorId ? editor.getShapePageBounds(`shape:${anchorId.replace(/^shape:/, '')}` as TLShapeId) : undefined;
	if (anchor) return place.below ? { x: anchor.x, y: anchor.maxY + GAP } : { x: anchor.maxX + GAP, y: anchor.y };
	return place.at;
}

const layoutOf = (layout: TableLayout | undefined, boxes: Box[], columns: number, at: { x: number; y: number } | undefined, gap: number) =>
	layout === 'row' ? rowLayout(boxes, at, gap) : layout === 'column' ? columnLayout(boxes, at, gap) : layout === 'columns' ? columnsLayout(boxes, columns, at, gap) : gridLayout(boxes, columns, at, gap);

/**
 * Several notes in one change: made, measured (notes grow with their text), set out together
 * a grid step apart, and anything they land on pushed down. One undo takes them all back.
 */
function addNotes(editor: Editor, op: { notes: TableNote[]; layout?: TableLayout; columns?: number } & TablePlace) {
	const ids: TLShapeId[] = [];
	// A blank keeps its place in the layout and makes nothing.
	const cells: (TLShapeId | null)[] = [];
	editor.markHistoryStoppingPoint('add notes');
	editor.run(() => {
		for (const note of op.notes) {
			if (note.blank) { cells.push(null); continue; }
			const id = createShapeId();
			const text = written(String(note.text ?? '').slice(0, 2000));
			const color = note.color ? { color: note.color } : {};
			if (note.style === 'text') editor.createShape({ id, type: 'text', x: 0, y: 0, props: { richText: text, autoSize: false, w: Math.max(160, Math.min(800, note.w ?? 360)), ...color } });
			else editor.createShape({ id, type: 'note', x: 0, y: 0, props: { richText: text, ...color } });
			ids.push(id);
			cells.push(id);
		}
	});
	if (!ids.length) return ids;
	const measured = new Map(boxesOf(editor, ids.map((id) => editor.getShape(id)!)).map((box) => [box.id, box]));
	// Every box starts at the origin, so the layouts' reading order is the order given.
	const boxes: Box[] = cells.map((id, index) => (id ? { ...measured.get(short(id))!, x: 0, y: 0 } : { id: `blank-${index}`, x: 0, y: 0, w: 200, h: 0 }));
	const columns = Math.max(1, Math.min(boxes.length, op.columns ?? Math.min(boxes.length, 4)));
	// Laid out at the origin first to learn how much room the set needs, then moved to a place with that much free.
	const draft = layoutOf(op.layout === 'pack' ? 'grid' : op.layout ?? 'grid', boxes, columns, { x: 0, y: 0 }, GAP);
	const sizes = new Map(boxes.map((box) => [box.id, box]));
	const size = draft.reduce((room, spot) => ({ w: Math.max(room.w, spot.x + sizes.get(spot.id)!.w), h: Math.max(room.h, spot.y + sizes.get(spot.id)!.h) }), { w: 0, h: 0 });
	const byId = new Map(draft.map((spot) => [spot.id, spot]));
	const origin = originOf(editor, op) ?? openSpot(editor, size, undefined, ids);
	editor.updateShapes(ids.map((id) => { const shape = editor.getShape(id)!, spot = byId.get(short(id))!; return { id, type: shape.type, x: onGrid(origin.x) + spot.x, y: onGrid(origin.y) + spot.y }; }));
	// Set beside or at something named, they may land on what's already there: that is pushed down, not covered.
	const moves = tidyLayout(boxesOf(editor, shapesFor(editor, undefined).filter(SOLID)), GAP, short(ids[0]));
	if (moves.length) place(editor, moves);
	const added = editor.getShapePageBounds(ids[0]);
	if (added && !editor.getViewportPageBounds().contains(added)) editor.zoomToFit({ animation: { duration: 220 } });
	return ids;
}

/**
 * Boxes to lay out or push apart: a frame's takes in its name, drawn above it, so nothing is set on
 * the name. `unroomed` turns where such a box goes back into where its shape goes.
 */
function roomOf(editor: Editor, shapes: TLShape[]): Box[] {
	return boxesOf(editor, shapes).map((box) => (shapeOf(editor, box.id)?.type === 'frame' ? { ...box, y: box.y - FRAME_LABEL, h: box.h + FRAME_LABEL } : box));
}
const unroomed = (editor: Editor, placements: Placement[]) => placements.map((spot) => (shapeOf(editor, spot.id)?.type === 'frame' ? { ...spot, y: spot.y + FRAME_LABEL } : spot));

const wait = (ms = ANIMATION.animation.duration + 60) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One level of the table set out by `arrange` (`$lib/table-arrange`): these shapes as boxes (a
 * frame's taking in its name), and the arrows tied to them as the graph. An arrow's end inside
 * one of the shapes (an item in a frame) counts as that shape, so frames joined through what
 * they hold are joined.
 */
function arrangement(editor: Editor, shapes: TLShape[], op: Extract<TableOp, { op: 'arrange' }>, at?: { x: number; y: number }, middles?: Map<string, number>) {
	const ids = new Set(shapes.map((shape) => shape.id));
	const within = (id: TLShapeId | string): string | undefined => {
		const shape = shapeOf(editor, id);
		const holder = shape && (ids.has(shape.id) ? shape : editor.getShapeAncestors(shape).reverse().find((ancestor) => ids.has(ancestor.id)));
		return holder ? short(holder.id) : undefined;
	};
	const links = editor.getCurrentPageShapes().filter((shape): shape is TLArrowShape => shape.type === 'arrow').flatMap((arrow) => {
		const ends = getArrowBindings(editor, arrow);
		const from = ends.start && within(ends.start.toId), to = ends.end && within(ends.end.toId);
		return from && to && from !== to ? [{ arrow, from, to }] : [];
	});
	const edges: Edge[] = links.map(({ from, to }) => ({ from, to }));
	// A box may be counted as standing at another height (`middles`), where order goes by height: a new branch's place among its siblings.
	const boxes = roomOf(editor, shapes).map((box) => (middles?.has(box.id) ? { ...box, y: middles.get(box.id)! - box.h / 2 } : box));
	const named = op.layout === 'cluster' && op.groups?.length
		? op.groups.map((group) => ({ ...group, ids: group.ids.flatMap((id) => within(id) ?? []) }))
		: op.layout === 'cluster' ? clustersBy(shapes.map((shape) => ({ id: short(shape.id), kind: itemOf(editor, shape).type, color: (shape.props as { color?: string }).color })), op.by ?? 'kind', edges) : undefined;
	const gap = Math.max(0, Math.min(200, op.gap ?? GAP));
	const result = arrange({ mode: op.layout, boxes, edges, at, gap, ordered: op.ordered, columns: op.columns, direction: op.direction, root: op.root ? within(op.root) : undefined, groups: named, clusterGap: op.frame === false ? 120 : 200, headings: shapes.filter((shape) => shape.type === 'text').map((shape) => short(shape.id)) });
	const placements = unroomed(editor, result.placements);
	// Arrows bent to suit where things were are straightened for a tree or flow (or squared off into
	// elbows), then curved only as far as it takes to clear a card in the way: a flow's long way back, say.
	const restyle = op.arrows === 'straight' || op.arrows === 'elbow' || (op.arrows !== 'keep' && usesArrows(result.mode));
	const going = new Map(placements.map((spot) => [spot.id, spot]));
	const landed = boxesOf(editor, shapes).map((box) => ({ ...box, ...going.get(box.id) }));
	const arrows = restyle ? routed(editor, landed, links, op.arrows === 'elbow', result.mode === 'outline' && op.arrows !== 'straight') : { shapes: [], bindings: [] };
	return { result, placements, arrows, gap };
}

/**
 * Arrows as `routeArrows` runs them between boxes where they have landed (or stand): each one's
 * curve and label place, and where its ends meet their cards, as changes to make in one go. An
 * end tied to something inside a box (an item in a frame) keeps its place.
 */
function routed(editor: Editor, landed: Box[], links: { arrow: TLArrowShape; from: string; to: string }[], elbow = false, outline = false) {
	const routes = new Map(routeArrows(landed, links.map(({ arrow, from, to }) => ({ id: arrow.id, from, to, label: renderPlaintextFromRichText(editor, arrow.props.richText) })), { elbow, outline }).map((route) => [route.id, route]));
	const shapes: TLShapePartial[] = [], bindings: TLBindingUpdate[] = [];
	for (const { arrow, from, to } of links) {
		const route = routes.get(arrow.id);
		if (!route) continue;
		shapes.push({ id: arrow.id, type: 'arrow', props: { bend: route.bend, labelPosition: route.labelPosition, ...(elbow ? { kind: 'elbow' as const } : {}) } });
		const ends = getArrowBindings(editor, arrow);
		for (const [binding, holder, anchor, precise] of [[ends.start, from, route.start, route.startPrecise], [ends.end, to, route.end, route.endPrecise]] as const) {
			if (binding && short(binding.toId) === holder) bindings.push({ id: binding.id, type: 'arrow', props: { normalizedAnchor: anchor, isPrecise: precise } } as TLBindingUpdate);
		}
	}
	return { shapes, bindings };
}

/** Arrows among these shapes run again where the shapes stand now (`tidy`). */
function reroute(editor: Editor, shapes: TLShape[]) {
	const ids = new Set(shapes.map((shape) => shape.id));
	const links = editor.getCurrentPageShapes().filter((shape): shape is TLArrowShape => shape.type === 'arrow' && shape.props.kind !== 'elbow').flatMap((arrow) => {
		const ends = getArrowBindings(editor, arrow);
		return ends.start && ends.end && ids.has(ends.start.toId) && ids.has(ends.end.toId) && ends.start.toId !== ends.end.toId ? [{ arrow, from: short(ends.start.toId), to: short(ends.end.toId) }] : [];
	});
	const plan = routed(editor, boxesOf(editor, shapes), links);
	editor.run(() => { editor.updateShapes(plan.shapes); editor.updateBindings(plan.bindings); });
	return links.length;
}

/** The shapes a frame holds that take up room. */
const heldBy = (editor: Editor, frame: TLShape) => editor.getSortedChildIdsForParent(frame.id).map((id) => editor.getShape(id)!).filter(SOLID);

/**
 * `arrange`: the whole table, some items, or what one frame holds, set out in one change. Whatever
 * the new layout lands on is pushed down, frames are refitted around what they hold, and named
 * clusters get frames of their own.
 */
async function arrangeOp(editor: Editor, op: Extract<TableOp, { op: 'arrange' }>) {
	const named = op.ids?.length ? shapesFor(editor, op.ids) : [];
	// A frame is named by its id, or by the name written on it.
	const called = (name: string) => editor.getCurrentPageShapes().find((shape) => shape.type === 'frame' && (shape.props as { name: string }).name.trim().toLowerCase() === name.trim().toLowerCase());
	const holder = op.inside ? shapeOf(editor, op.inside) ?? called(op.inside) : named.length === 1 ? named[0] : undefined;
	const holding = holder?.type === 'frame' ? holder : undefined;
	if (op.inside && !holding) return { arranged: 0, note: '`inside` takes the id or the name of a frame on the table.' };
	editor.markHistoryStoppingPoint('arrange');
	const page = editor.getCurrentPageId();
	const done: Record<string, unknown> = {};
	let result: ArrangeResult;
	let count: number;

	if (holding) {
		const shapes = heldBy(editor, holding);
		const bounds = editor.getShapePageBounds(holding)!;
		const plan = arrangement(editor, shapes, op, originOf(editor, op) ?? { x: bounds.x + FRAME_PAD, y: bounds.y + FRAME_PAD });
		editor.run(() => { place(editor, plan.placements); editor.updateShapes(plan.arrows.shapes); editor.updateBindings(plan.arrows.bindings); });
		await wait();
		// The frame takes the shape of what it now holds, and what that lands on moves down.
		editor.run(() => fitFrameToContent(editor, holding.id, { padding: FRAME_PAD }));
		const around = editor.getSortedChildIdsForParent(holding.parentId).map((id) => editor.getShape(id)!).filter(SOLID);
		place(editor, unroomed(editor, tidyLayout(roomOf(editor, around), GAP, [short(holding.id)]).filter((move) => move.id !== short(holding.id))));
		({ result } = plan);
		count = shapes.length;
		done.inside = short(holding.id);
	} else {
		// A whole table set out as it suits: what each frame holds first, so the frames are their final size.
		if (!named.length && op.layout === 'auto') {
			const frames = editor.getSortedChildIdsForParent(page).map((id) => editor.getShape(id)!).filter((shape) => shape.type === 'frame' && heldBy(editor, shape).length > 1);
			editor.run(() => {
				for (const inner of frames) {
					const bounds = editor.getShapePageBounds(inner)!;
					const plan = arrangement(editor, heldBy(editor, inner), { op: 'arrange', layout: 'auto', gap: op.gap }, { x: bounds.x + FRAME_PAD, y: bounds.y + FRAME_PAD });
					place(editor, plan.placements, false);
					editor.updateShapes(plan.arrows.shapes);
					editor.updateBindings(plan.arrows.bindings);
					fitFrameToContent(editor, inner.id, { padding: FRAME_PAD });
				}
			});
			if (frames.length) done.frames_tidied = frames.length;
		}
		const turn = new Map((op.ordered ? op.ids ?? [] : []).map((id, index) => [short(id), index]));
		const shapes = outermost(editor, shapesFor(editor, op.ids).filter(SOLID)).sort((a, b) => (turn.get(short(a.id)) ?? 0) - (turn.get(short(b.id)) ?? 0));
		const plan = arrangement(editor, shapes, op, originOf(editor, op));
		// What shares their frame (or the table) and would be covered moves down, measured from where things are going.
		const parents = new Set(shapes.map((shape) => shape.parentId));
		const moving = new Map(plan.result.placements.map((spot) => [spot.id, spot]));
		const beside = parents.size === 1 ? editor.getSortedChildIdsForParent(shapes[0].parentId).map((id) => editor.getShape(id)!).filter(SOLID) : [];
		const pushed = unroomed(editor, tidyLayout(roomOf(editor, beside).map((box) => ({ ...box, ...moving.get(box.id) })), plan.gap, moving.keys()).filter((move) => !moving.has(move.id)));
		editor.run(() => { place(editor, [...plan.placements, ...pushed]); editor.updateShapes(plan.arrows.shapes); editor.updateBindings(plan.arrows.bindings); });
		({ result } = plan);
		count = shapes.length;
		if (pushed.length) done.pushed_aside = pushed.length;
		// Named clusters each get a frame, once they have come to rest. Only on the table itself: frames don't nest well.
		const framed = (result.groups ?? []).filter((group) => group.name && op.frame !== false);
		if (framed.length && shapes.every((shape) => shape.parentId === page)) {
			await wait();
			done.frames = framed.map((group) => ({ name: group.name, id: frame(editor, { op: 'frame', name: group.name!, ids: group.ids }).added[0], holds: group.ids.length }));
		} else if (result.groups) done.groups = result.groups.map((group) => ({ ...(group.name ? { name: group.name } : {}), holds: group.ids.length }));
	}
	const report = await changed(editor, { arranged: count, as: result.mode, ...done, ...(result.note ? { note: result.note } : {}) });
	if (!named.length && !holding && op.zoom !== false) editor.zoomToFit({ animation: { duration: 220 } });
	return report;
}

/**
 * Shapes already standing where they belong are shown travelling there from where they stood.
 * The journey is kept out of undo (the change itself is already in it, whole), so words typed
 * while things are still moving never leave an undo step that stops them halfway.
 */
function glide(editor: Editor, from: Map<TLShapeId, { x: number; y: number }>, duration = 180): () => void {
	const moves = [...from].flatMap(([id, start]) => {
		const shape = editor.getShape(id);
		return shape && (Math.abs(shape.x - start.x) > 0.5 || Math.abs(shape.y - start.y) > 0.5) ? [{ id, type: shape.type, start, end: { x: shape.x, y: shape.y }, at: { x: shape.x, y: shape.y } }] : [];
	});
	if (!moves.length || editor.user.getAnimationSpeed() === 0) return () => {};
	let elapsed = 0, over = false;
	const set = (t: number) => editor.run(() => editor.updateShapes(moves.map((move) => { move.at = { x: move.start.x + (move.end.x - move.start.x) * t, y: move.start.y + (move.end.y - move.start.y) * t }; return { id: move.id, type: move.type, ...move.at }; })), { history: 'ignore' });
	const stop = () => { over = true; editor.off('tick', tick); };
	/** Whether everything is still where this last put it: an undo, or a hand, takes over otherwise. */
	const ours = () => moves.every((move) => { const shape = editor.getShape(move.id); return shape && Math.abs(shape.x - move.at.x) < 0.01 && Math.abs(shape.y - move.at.y) < 0.01; });
	function tick(ms: number) {
		if (over) return;
		if (!ours()) return stop();
		elapsed += ms;
		const t = Math.min(1, elapsed / duration);
		set(1 - (1 - t) ** 3);
		if (t >= 1) stop();
	}
	set(0);
	editor.on('tick', tick);
	// Asked to finish early (the next change is here), everything goes straight to its place.
	return () => { if (!over && ours()) set(1); stop(); };
}

let landing: (() => void) | undefined;

/**
 * Mind map mode's layout: these joined blocks set out as an outline at once, `anchor` (their root)
 * staying where it is, whatever they would cover moving down. `middles` counts a block as standing
 * at another height when siblings are put in order.
 */
function layOutTree(editor: Editor, ids: string[], anchor: string, middles?: Map<string, number>) {
	landing?.();
	const shapes = outermost(editor, shapesFor(editor, ids).filter(SOLID));
	const root = shapeOf(editor, anchor), stood = root && editor.getShapePageBounds(root);
	if (shapes.length < 2 || !stood) return;
	const plan = arrangement(editor, shapes, { op: 'arrange', layout: 'outline' }, undefined, middles);
	const lands = plan.placements.find((spot) => spot.id === short(anchor));
	if (!lands) return;
	const by = { x: stood.x - lands.x, y: stood.y - lands.y };
	const placements = plan.placements.map((spot) => ({ ...spot, x: spot.x + by.x, y: spot.y + by.y }));
	const parents = new Set(shapes.map((shape) => shape.parentId));
	const moving = new Map(placements.map((spot) => [spot.id, spot]));
	const beside = parents.size === 1 ? editor.getSortedChildIdsForParent(shapes[0].parentId).map((id) => editor.getShape(id)!).filter(SOLID) : shapes;
	const pushed = unroomed(editor, tidyLayout(roomOf(editor, beside).map((box) => ({ ...box, ...moving.get(box.id) })), plan.gap, moving.keys()).filter((move) => !moving.has(move.id)));
	const from = new Map(beside.map((shape) => [shape.id, { x: shape.x, y: shape.y }]));
	editor.run(() => {
		place(editor, [...placements, ...pushed], false);
		editor.updateShapes(plan.arrows.shapes);
		editor.updateBindings(plan.arrows.bindings);
		wrapFrames(editor);
	});
	landing = glide(editor, from);
}

/**
 * A sticky note made from another's edge (tldraw's handles there: a press makes one beside it, a
 * drag carries one off) is joined to the note it came from by an arrow, in the same step to undo.
 */
function joinNotesFromEdges(editor: Editor) {
	// tldraw leaves its handle state before it makes the note, so the note pressed is remembered from the press
	// (events are told here after tldraw has acted on them: by then a press on a handle has entered that state).
	let from: TLShapeId | undefined;
	const onEvent = (info: TLEventInfo) => {
		if (info.type !== 'pointer') return;
		if (info.name === 'pointer_down') {
			const pressed = editor.isIn('select.pointing_handle') ? (editor.getStateDescendant('select.pointing_handle') as unknown as { info?: { shape?: TLShape } } | undefined)?.info?.shape : undefined;
			from = pressed?.type === 'note' ? pressed.id : undefined;
		} else if (info.name === 'pointer_up') setTimeout(() => (from = undefined));
	};
	editor.on('event', onEvent);
	const off = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source !== 'user' || shape.type !== 'note' || !from || from === shape.id || !editor.getShape(from)) return;
		const origin = from;
		from = undefined;
		connect(editor, [{ from: short(origin), to: short(shape.id) }]);
	});
	return () => { off(); editor.off('event', onEvent); };
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
	const issues = ids?.length ? layoutIssues(boxes) : issuesOf(editor);

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

const shapeOf = (editor: Editor, id: string) => editor.getShape(`shape:${id.replace(/^shape:/, '')}` as TLShapeId);
const short = (id: string) => id.replace(/^shape:/, '');

/** Arrows tied to the items at each end (tldraw arrow bindings), so they follow when things move. */
function connect(editor: Editor, links: TableLink[]) {
	const added: string[] = [];
	const missing: string[] = [];
	editor.run(() => {
		for (const link of links) {
			const from = shapeOf(editor, link.from), to = shapeOf(editor, link.to);
			if (!from || !to || from.id === to.id) { missing.push(`${link.from}→${link.to}`); continue; }
			const a = editor.getShapePageBounds(from)!.center, b = editor.getShapePageBounds(to)!.center;
			const id = createShapeId();
			editor.createShape<TLArrowShape>({
				id, type: 'arrow', x: a.x, y: a.y,
				props: {
					start: { x: 0, y: 0 }, end: { x: b.x - a.x, y: b.y - a.y }, kind: link.kind ?? 'arc', bend: Math.max(-300, Math.min(300, link.bend ?? 0)),
					color: link.color ?? 'white', dash: link.dash ?? 'draw', arrowheadStart: link.both_ends ? 'arrow' : 'none', arrowheadEnd: 'arrow',
					richText: toRichText((link.label ?? '').slice(0, 200))
				}
			});
			const end = (terminal: 'start' | 'end', target: TLShape) => ({ type: 'arrow' as const, fromId: id, toId: target.id, props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' as const } });
			editor.createBindings([end('start', from), end('end', to)]);
			added.push(short(id));
		}
	});
	return { added, ...(missing.length ? { not_found: missing } : {}) };
}

/** Room above a map's cards for its heading and the line under it. */
const MAP_HEADER = 200;

/**
 * A map set down whole: heading, cards where the server's layout put them, and the ties between
 * them, sent to the back so every line runs under the cards. Strong ties are solid; likeness is a
 * thin dotted grey. A map with the same key is replaced where it stands.
 */
function addMap(editor: Editor, op: { key: string; title?: string; note?: string; cards: TableMapCard[]; links: TableMapLink[]; at?: { x: number; y: number } }) {
	const mine = (shape: TLShape) => shape.meta?.map === op.key;
	const old = editor.getCurrentPageShapes().filter(mine);
	const rest = editor.getCurrentPageShapes().filter((shape) => !mine(shape) && !shape.parentId.startsWith('shape:') && shape.type !== 'arrow');
	const was = old.length ? editor.getShapePageBounds(old.find((shape) => shape.meta?.mapPart === 'title') ?? old[0]) : undefined;
	const others = rest.map((shape) => editor.getShapePageBounds(shape)).filter((box): box is NonNullable<typeof box> => !!box);
	// Where it was; or where asked; or clear of everything else, underneath; or the middle of an empty table.
	const origin = op.at ?? (was ? { x: was.x, y: was.y } : others.length ? { x: Math.min(...others.map((box) => box.x)), y: Math.max(...others.map((box) => box.maxY)) + 240 } : { x: 0, y: 0 });
	const left = onGrid(origin.x), top = onGrid(origin.y);
	const meta = { map: op.key };
	const cards: TLShapeId[] = [], lines: TLShapeId[] = [];
	editor.markHistoryStoppingPoint('add map');
	editor.run(() => {
		if (old.length) editor.deleteShapes(old.map((shape) => shape.id));
		// The heading is read with the whole map in view, so it grows with the map.
		const wide = Math.max(0, ...op.cards.map((card) => card.x + card.w));
		const big = Math.max(1, Math.min(5, Math.round((wide / 1500) * 4) / 4));
		if (op.title) editor.createShape({ id: createShapeId(), type: 'text', x: left, y: top, meta: { ...meta, mapPart: 'title' }, props: { richText: toRichText(op.title.slice(0, 120)), size: 'xl', autoSize: true, color: 'white', scale: big } });
		if (op.note) editor.createShape({ id: createShapeId(), type: 'text', x: left, y: top + 80 * big, meta, props: { richText: toRichText(op.note.slice(0, 400)), size: 's', autoSize: false, w: 1100, color: 'white', scale: big } });
		const down = op.title || op.note ? onGrid(MAP_HEADER * 0.8 * big) : 0;
		for (const card of op.cards) {
			const id = createShapeId();
			editor.createShape<SiteBlockShape>({ id, type: BLOCK_SHAPE, x: left + onGrid(card.x), y: top + down + onGrid(card.y), props: { ...blockProps(card.block), w: Math.max(40, Math.round(card.w)), h: Math.max(40, Math.round(card.h)) }, meta });
			cards.push(id);
		}
		for (const link of op.links) {
			const from = cards[link.from], to = cards[link.to];
			if (!from || !to || from === to) continue;
			const a = editor.getShapePageBounds(from)!.center, b = editor.getShapePageBounds(to)!.center;
			const id = createShapeId();
			editor.createShape<TLArrowShape>({
				id, type: 'arrow', x: a.x, y: a.y, meta,
				props: {
					start: { x: 0, y: 0 }, end: { x: b.x - a.x, y: b.y - a.y }, kind: 'arc', bend: 0, arrowheadStart: 'none', arrowheadEnd: 'none',
					...(link.strong ? { color: 'white', dash: 'solid', size: 'm' } : { color: 'grey', dash: 'dotted', size: 'm' }),
					richText: toRichText(link.strong ? (link.label ?? '').slice(0, 60) : '')
				}
			});
			const end = (terminal: 'start' | 'end', target: TLShapeId) => ({ type: 'arrow' as const, fromId: id, toId: target, props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' as const } });
			editor.createBindings([end('start', from), end('end', to)]);
			lines.push(id);
		}
		// Lines first in the stack, likeness lowest: cards sit on top of every line.
		if (lines.length) editor.sendToBack(lines);
	});
	editor.selectNone();
	editor.setCurrentTool('select');
	const box = cards.length ? editor.getShapePageBounds(cards[0]) : undefined;
	if (box) editor.zoomToFit({ animation: { duration: 320 } });
	return { cards: cards.map(short), lines: lines.length, replaced: old.length > 0, at: { x: left, y: top } };
}

/** Pen strokes in page units: a path through points, or a loop drawn around an item. */
function draw(editor: Editor, strokes: TableStroke[]) {
	const added: string[] = [];
	editor.run(() => {
		for (const stroke of strokes) {
			let points = (stroke.points ?? []).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)).slice(0, 500);
			let closed = !!stroke.closed;
			const around = stroke.around ? shapeOf(editor, stroke.around) : undefined;
			let meta = {};
			if (around) {
				const box = editor.getShapePageBounds(around)!;
				meta = { around: short(around.id), center: { x: box.center.x, y: box.center.y } };
				const rx = box.w / 2 + 24, ry = box.h / 2 + 24;
				points = Array.from({ length: 49 }, (_, index) => ({ x: box.center.x + rx * Math.cos((index / 48) * Math.PI * 2), y: box.center.y + ry * Math.sin((index / 48) * Math.PI * 2) }));
				closed = true;
			}
			if (points.length < 2) continue;
			// Straight runs get points along them, so the pen's wobble reads as hand-drawn.
			const dense = points.flatMap((point, index) => {
				const next = points[index + 1];
				if (!next) return [point];
				const steps = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.y - point.y) / 16));
				return Array.from({ length: steps }, (_, step) => ({ x: point.x + ((next.x - point.x) * step) / steps, y: point.y + ((next.y - point.y) * step) / steps }));
			});
			const origin = dense[0];
			const id = createShapeId();
			editor.createShape({
				id, type: 'draw', x: origin.x, y: origin.y, meta,
				props: {
					segments: [{ type: 'free', path: b64Vecs.encodePoints(dense.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y, z: 0.5 }))) }],
					isComplete: true, isClosed: closed, isPen: false, color: stroke.color ?? 'white', size: stroke.size ?? 'm'
				}
			});
			added.push(short(id));
		}
	});
	return { added };
}

/**
 * What arrows to newly added blocks start from, given what the blocks were found by. One thing is
 * the start itself; several are put in an area first (the one they already share, when they do),
 * and the arrows start from the area. Things that have since left the table are passed over.
 */
function linkAnchor(editor: Editor, from: string[]): TLShapeId | undefined {
	const anchors = from.map((id) => shapeOf(editor, id)).filter((shape): shape is TLShape => !!shape && shape.type !== 'arrow');
	if (!anchors.length) return undefined;
	let anchor = anchors[0].id;
	if (anchors.length > 1) {
		const parent = anchors[0].parentId;
		const shared = anchors.every((shape) => shape.parentId === parent) ? editor.getShape(parent as TLShapeId) : undefined;
		// The area made the last time is used again while it holds just these things.
		const same = shared?.type === 'frame' && editor.getSortedChildIdsForParent(shared.id).filter((id) => editor.getShape(id)?.type !== 'arrow').length === anchors.length;
		anchor = same ? shared!.id : (`shape:${frame(editor, { op: 'frame', name: '', ids: anchors.map((shape) => short(shape.id)) }).added[0]}` as TLShapeId);
	}
	return anchor;
}

/** A named frame: around items (which move into it), or empty at a place. */
function frame(editor: Editor, op: Extract<TableOp, { op: 'frame' }>) {
	const inside = op.ids?.length ? shapesFor(editor, op.ids) : [];
	const pad = 40;
	const around = inside.length ? editor.getShapesPageBounds(inside.map((shape) => shape.id)) : null;
	const x = around ? onGrid(around.x - pad) : onGrid(op.at?.x ?? editor.getViewportPageBounds().center.x - 200);
	const y = around ? onGrid(around.y - pad) : onGrid(op.at?.y ?? editor.getViewportPageBounds().center.y - 150);
	const w = around ? Math.ceil((around.w + pad * 2) / GRID) * GRID : Math.max(120, op.w ?? 400);
	const h = around ? Math.ceil((around.h + pad * 2) / GRID) * GRID : Math.max(120, op.h ?? 300);
	const id = createShapeId();
	editor.run(() => {
		editor.createShape({ id, type: 'frame', x, y, props: { w, h, name: op.name.slice(0, 120), color: op.color ?? 'white' } });
		if (inside.length) editor.reparentShapes(inside, id);
		// A frame is drawn under what it holds, and under arrows that cross it.
		editor.sendToBack([id]);
	});
	return { added: [short(id)], holds: inside.map((shape) => short(shape.id)) };
}

/** New text for notes, text, arrow labels and frame names, and new colours. */
function edit(editor: Editor, edits: Extract<TableOp, { op: 'edit' }>['edits']) {
	const updates = edits.flatMap(({ id, text, color }) => {
		const shape = shapeOf(editor, id);
		if (!shape || editor.isShapeOfType(shape, BLOCK_SHAPE)) return [];
		const props: Record<string, unknown> = {};
		if (text !== undefined) {
			if (shape.type === 'frame') props.name = text.slice(0, 120);
			else if ('richText' in shape.props) props.richText = written(text.slice(0, 2000));
		}
		if (color && 'color' in shape.props) props.color = color;
		return Object.keys(props).length ? [{ id: shape.id, type: shape.type, props } as TLShapePartial] : [];
	});
	editor.updateShapes(updates);
	return { edited: updates.length };
}

/** Blocks drawn again as other blocks, where they stand: the same card with a different link. Size and tag ref stay. */
function setBlocks(editor: Editor, blocks: Extract<TableOp, { op: 'set_blocks' }>['cards']) {
	const skipped: string[] = [];
	const updates = blocks.flatMap(({ id, block }) => {
		const shape = shapeOf(editor, id);
		if (!shape || !editor.isShapeOfType(shape, BLOCK_SHAPE)) { skipped.push(id); return []; }
		const current = shape as SiteBlockShape;
		const { w: _w, h: _h, hideMeta: _hideMeta, ...props } = blockProps({ ...block, ref: block.ref ?? (current.props.ref || undefined) });
		return [{ id: current.id, type: BLOCK_SHAPE, props, meta: fitsToPost(block) ? { ...current.meta, fit: true } : current.meta } as TLShapePartial];
	});
	editor.updateShapes(updates);
	return { relinked: updates.length, ...(skipped.length ? { skipped } : {}) };
}

async function performOp(editor: Editor, op: Parameters<TableApi['perform']>[0], api: TableApi): Promise<unknown> {
	switch (op.op) {
		case 'read': {
			const shapes = editor.getCurrentPageShapesSorted();
			return { items: shapes.map((shape) => itemOf(editor, shape)), selected: editor.getSelectedShapeIds().map((id) => id.replace(/^shape:/, '')), issues: issuesOf(editor) };
		}
		case 'look':
			return look(editor, op.ids);
		case 'add_blocks':
			return changed(editor, { added: api.addBlocks(op.blocks, op.at, { columns: op.columns ?? Math.min(op.blocks.length, 4), page: !!op.at, sizes: op.sizes, plain: op.plain }).map((id) => id.replace(/^shape:/, '')) });
		case 'add_map': {
			const made = addMap(editor, op);
			const issues = await settled(editor);
			return { ...made, ...(issues.overlaps.length ? { overlaps: issues.overlaps.length } : { layout: 'no overlaps' }) };
		}
		case 'add_note': {
			const id = createShapeId();
			const text = written(op.text.slice(0, 2000));
			editor.markHistoryStoppingPoint('add note');
			// Long text reads better as a wrapped text card than a sticky note, which shrinks its type to fit.
			const color = op.color ? { color: op.color } : {};
			if (op.style === 'text') editor.createShape({ id, type: 'text', x: 0, y: 0, props: { richText: text, autoSize: false, w: Math.max(160, Math.min(800, op.w ?? 360)), ...color } });
			else editor.createShape({ id, type: 'note', x: 0, y: 0, props: { richText: text, ...color } });
			placeNew(editor, id, op);
			const report = await changed(editor, {});
			const bounds = editor.getShapePageBounds(id)!;
			return { added: [{ id: id.replace(/^shape:/, ''), x: Math.round(bounds.x), y: Math.round(bounds.y), w: Math.round(bounds.w), h: Math.round(bounds.h) }], ...report };
		}
		case 'add_shape': {
			const id = createShapeId();
			const side = (value: number | undefined) => Math.max(40, Math.min(1200, onGrid(value ?? 200)));
			editor.markHistoryStoppingPoint('add shape');
			editor.createShape({ id, type: 'geo', x: 0, y: 0, props: { geo: op.shape as TLGeoShapeGeoStyle, w: side(op.w), h: side(op.h ?? op.w), ...(op.text ? { richText: toRichText(op.text.slice(0, 400)) } : {}), ...(op.color ? { color: op.color } : {}) } });
			placeNew(editor, id, op);
			const bounds = editor.getShapePageBounds(id)!;
			return changed(editor, { added: [{ id: short(id), x: Math.round(bounds.x), y: Math.round(bounds.y), w: Math.round(bounds.w), h: Math.round(bounds.h) }] });
		}
		case 'add_notes': {
			const ids = addNotes(editor, op);
			return changed(editor, { added: ids.map((id) => short(id)) });
		}
		case 'move': {
			editor.markHistoryStoppingPoint('move');
			const shapes = new Map(shapesFor(editor, op.moves.map((move) => move.id)).map((shape) => [shape.id.replace(/^shape:/, ''), shape]));
			// How far each moved shape travels on the page; parents are worked out before what they hold.
			const travel = new Map<TLShapeId, { x: number; y: number }>();
			const depth = (move: { id: string }) => { const shape = shapes.get(move.id.replace(/^shape:/, '')); return shape ? editor.getShapeAncestors(shape).length : 0; };
			const updates = op.moves.toSorted((a, b) => depth(a) - depth(b)).flatMap((move) => {
				const shape = shapes.get(move.id.replace(/^shape:/, ''));
				if (!shape) return [];
				const resizable = editor.isShapeOfType(shape, BLOCK_SHAPE) || shape.type === 'text';
				const props = resizable && (move.w || move.h) ? { props: { ...(move.w ? { w: onGrid(move.w) } : {}), ...(move.h && shape.type !== 'text' ? { h: onGrid(move.h) } : {}), ...(shape.type === 'text' ? { autoSize: false } : {}) } } : {};
				const bounds = editor.getShapePageBounds(shape);
				if (!bounds) return [];
				// A frame named along with what it holds carries those items with it: they move only the rest of the way.
				const carrier = editor.getShapeAncestors(shape).reverse().find((ancestor) => travel.has(ancestor.id));
				const carried = carrier ? travel.get(carrier.id)! : { x: 0, y: 0 };
				const go = { x: move.x === undefined ? carried.x : onGrid(move.x) - bounds.x, y: move.y === undefined ? carried.y : onGrid(move.y) - bounds.y };
				travel.set(shape.id, go);
				const by = inParent(editor, shape, { x: go.x - carried.x, y: go.y - carried.y });
				return [{ id: shape.id, type: shape.type, x: shape.x + by.x, y: shape.y + by.y, ...props } as TLShapePartial];
			});
			editor.animateShapes(updates, ANIMATION);
			return changed(editor, { moved: updates.length });
		}
		case 'arrange':
			return arrangeOp(editor, op);
		case 'align': {
			const shapes = outermost(editor, shapesFor(editor, op.ids).filter(SOLID));
			if (shapes.length < 2) return { aligned: 0, note: 'Name at least two items.' };
			editor.markHistoryStoppingPoint('align');
			if (op.align) editor.alignShapes(shapes, op.align);
			if (op.distribute && shapes.length > 2) editor.distributeShapes(shapes, op.distribute);
			return changed(editor, { aligned: shapes.length });
		}
		case 'tidy': {
			const shapes = outermost(editor, shapesFor(editor, op.ids).filter(SOLID));
			editor.markHistoryStoppingPoint('tidy');
			const moved = place(editor, tidyLayout(boxesOf(editor, shapes)));
			if (moved) await wait();
			// Arrows among them run again where things now stand: ends fanned out, curves around cards in the way, labels apart.
			const cards = shapes.flatMap((shape) => (shape.type === 'frame' || shape.type === 'group' ? [shape, ...editor.getSortedChildIdsForParent(shape.id).map((id) => editor.getShape(id)!)] : [shape])).filter((shape) => shape.type !== 'frame' && shape.type !== 'group');
			return changed(editor, { moved, arrows_routed: reroute(editor, cards) });
		}
		case 'connect':
			editor.markHistoryStoppingPoint('connect');
			return changed(editor, connect(editor, op.links));
		case 'draw':
			editor.markHistoryStoppingPoint('draw');
			return draw(editor, op.strokes);
		case 'frame':
			editor.markHistoryStoppingPoint('frame');
			return changed(editor, frame(editor, op));
		case 'group': {
			const shapes = shapesFor(editor, op.ids);
			if (shapes.length < 2) return { grouped: 0, note: 'Name at least two items.' };
			const id = createShapeId();
			editor.markHistoryStoppingPoint('group');
			editor.groupShapes(shapes, { groupId: id, select: false });
			return { group: short(id), holds: shapes.map((shape) => short(shape.id)) };
		}
		case 'ungroup': {
			const shapes = shapesFor(editor, op.ids).filter((shape) => shape.type === 'group' || shape.type === 'frame');
			editor.markHistoryStoppingPoint('ungroup');
			const groups = shapes.filter((shape) => shape.type === 'group');
			if (groups.length) editor.ungroupShapes(groups, { select: false });
			// A frame lets go of what it holds and goes.
			for (const shape of shapes.filter((shape) => shape.type === 'frame')) {
				editor.reparentShapes(editor.getSortedChildIdsForParent(shape.id), editor.getCurrentPageId());
				editor.deleteShapes([shape.id]);
			}
			return { ungrouped: shapes.length };
		}
		case 'set_blocks':
			editor.markHistoryStoppingPoint('relink');
			return changed(editor, setBlocks(editor, op.cards));
		case 'edit':
			editor.markHistoryStoppingPoint('edit');
			return changed(editor, edit(editor, op.edits));
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

/**
 * Turns the plain link blocks an older table saved for the site's posts and Casey's Are.na channels
 * into the rich blocks they stand for (`richerBlock`), where they stand, keeping their width. A post
 * grows to fit itself, as one just added does. Kept out of undo: it is a repair, not an edit.
 */
export async function upgradeLinkBlocks(editor: Editor, richer: typeof richerBlock = richerBlock): Promise<number> {
	const links = [...editor.getCurrentPageShapeIds()]
		.map((id) => editor.getShape(id))
		.filter((shape): shape is SiteBlockShape => !!shape && editor.isShapeOfType(shape, BLOCK_SHAPE) && (shape as SiteBlockShape).props.kind === 'link');
	const upgrades = await Promise.all(links.map(async (shape) => ({ shape, block: await richer(blockOf(shape.props)).catch(() => null) })));
	let count = 0;
	editor.run(
		() => {
			for (const { shape, block } of upgrades) {
				const current = editor.getShape<SiteBlockShape>(shape.id);
				if (!block || !current || current.props.kind !== 'link' || current.props.url !== shape.props.url) continue;
				const { w: _w, h: _h, hideMeta: _hideMeta, ...props } = blockProps(block);
				editor.updateShape<SiteBlockShape>({ id: current.id, type: BLOCK_SHAPE, props, meta: fitsToPost(block) ? { ...current.meta, fit: true } : current.meta });
				count++;
			}
		},
		{ history: 'ignore' }
	);
	return count;
}

/**
 * Auto layout: while the table's document asks for one (`autoLayoutOf`), the whole table is laid
 * out again after anything that takes up room is added, by a person or the chat. It waits for a
 * quiet moment: nothing being dragged, drawn or typed, and no more arriving.
 */
function keepLaidOut(editor: Editor, api: TableApi) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running = false;
	const busy = () => running || editor.inputs.getIsPointing() || editor.inputs.getIsDragging() || !!editor.getEditingShapeId();
	const run = async () => {
		const op = layoutOp(autoLayoutOf(editor.getDocumentSettings().meta) ?? '', 'table', []);
		if (!op) return;
		if (busy()) return void (timer = setTimeout(run, 400));
		running = true;
		try { await api.perform(op); } finally { running = false; }
	};
	const stop = editor.store.listen(
		({ changes }) => {
			// Mind map mode sets its own trees out as they change.
			if (running || !autoLayoutOf(editor.getDocumentSettings().meta) || mindMapOf(editor.getDocumentSettings().meta)) return;
			if (!Object.values(changes.added).some((record) => record.typeName === 'shape' && SOLID(record as TLShape))) return;
			clearTimeout(timer);
			timer = setTimeout(run, 400);
		},
		{ scope: 'document', source: 'user' }
	);
	return () => { stop(); clearTimeout(timer); };
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
			// A table saved with items outside their frame (hidden by it) is put right as it opens.
			editor.run(() => wrapFrames(editor), { history: 'ignore' });
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
			// One of the site's posts or Casey's Are.na channels comes in drawn as itself.
			editor.registerExternalContentHandler('url', async ({ url, point }) => {
				const block = await linkedBlock(url, [], location.origin);
				if (block) apiFor(editor).addBlocks([block], point ? editor.pageToScreen(point) : undefined);
			});

			const stop = editor.store.listen(() => onChange?.(getSnapshot(editor.store).document), { scope: 'document', source: 'user' });
			const api = apiFor(editor);
			// Pasted or dropped Markdown, as text or as .md files, becomes a tree: a block per heading and
			// list item, arrows from each to what it sits under. Other text and files go tldraw's own way.
			// (tldraw keeps its handlers on the editor but leaves them out of its types.)
			const theirs = (editor as unknown as { externalContentHandlers: { files?: ((content: { type: 'files'; files: File[]; point?: { x: number; y: number } }) => unknown) | null } }).externalContentHandlers.files;
			editor.registerExternalContentHandler('text', async (content) => {
				if (looksLikeMarkdown(content.text)) await api.addMarkdown(content.text, content.point);
				else await defaultHandleExternalTextContent(editor, content);
			});
			editor.registerExternalContentHandler('files', async (content) => {
				const written = content.files.filter(isMarkdownFile), rest = content.files.filter((file) => !isMarkdownFile(file));
				let at = content.point;
				for (const file of written) {
					const made = await api.addMarkdown(await file.text(), at);
					// The next file's tree goes to the right of this one.
					const bounds = made.length ? editor.getShapesPageBounds(made.map((id) => `shape:${id}` as TLShapeId)) : undefined;
					if (bounds) at = { x: bounds.maxX + GRID * 4, y: bounds.y };
				}
				if (rest.length) await theirs?.({ ...content, files: rest });
			});
			const stopLayout = editable ? keepLaidOut(editor, api) : () => {};
			onReady?.(api);
			// Read-only once the page has set anything out, so a seeded table can still be shown to visitors.
			editor.updateInstanceState({ isReadonly: !editable });
			if (editable) void upgradeLinkBlocks(editor);
			// Text blocks combine when one is dropped on another, and divide on Enter.
			const offText = editable ? installTextBlocks(editor, { pushAside }) : undefined;
			const offMind = editable
				? installMindMap(editor, {
						on: () => mindMapOf(editor.getDocumentSettings().meta),
						layOut: layOutTree,
						tie: (_editor, from, to) => { const made = connect(editor, [{ from: short(from), to: short(to) }]).added[0]; return made ? (`shape:${made}` as TLShapeId) : undefined; },
						openSpot,
						reveal
					})
				: undefined;
			const offNotes = editable ? joinNotesFromEdges(editor) : undefined;
			if (embedded) {
				editor.setCameraOptions({ wheelBehavior: 'none' });
				editor.setCurrentTool('hand');
			}
			return () => {
				stop();
				offText?.();
				offMind?.();
				offNotes?.();
				stopLayout();
				editor.off('event', offEvent);
			};
		},
		[editable, embedded, onChange, onReady]
	);

	const snapshot = document ? ({ document } as unknown as TLEditorSnapshot) : undefined;
	return <Tldraw hideUi shapeUtils={shapeUtils} snapshot={snapshot} licenseKey={licenseKey} onMount={onMount} />;
}
