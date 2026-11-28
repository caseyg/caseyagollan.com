/**
 * Text blocks that behave like an outline's lines, and the canvas side of voice notes
 * (`$lib/voice-notes`):
 *
 * - dropping one text block on another makes them one (`mergeRich`), arrows and all;
 * - Enter in a text block divides it at the caret into two, the second just below (Shift+Enter
 *   is still a new line);
 * - `voiceCanvas` is what a voice note writes with: a block whose words change as they are
 *   heard, corrected afterwards, and, when asked, joined by an arrow to the block it follows and
 *   set out with its neighbours as a tree.
 */
import { createShapeId, getArrowBindings, renderPlaintextFromRichText, startEditingShapeWithRichText, toRichText, type Editor, type TLArrowShape, type TLEventInfo, type TLShape, type TLShapeId, type TLTextShape } from 'tldraw';
import { BLOCK_SHAPE } from '$lib/tables';
import type { TableOp } from '$lib/table-agent';
import { GRID, freeSpot, onGrid, upToGrid, type Box } from '$lib/table-layout';
import { VOICE_BLOCK_WIDTH, mergeRich, trimRich, type RichDoc, type VoiceItem, type VoiceOp } from '$lib/voice-notes';

/** What a voice note asks of the canvas. Ids are the short ones the chat uses, without `shape:`. */
export interface VoiceCanvas {
	/** A block's words as they are heard: made on the first call (below `after`, or in the nearest open place), rewritten after. */
	write(id: string | undefined, text: string, after?: string): string;
	/** A correction, kept only if the block still reads as it was heard: an edit made meanwhile wins. */
	rewrite(id: string, text: string, heard: string): boolean;
	remove(id: string): void;
	/** What is on the table that a new block could follow: ids and first words, in the order they were made. */
	texts(limit?: number): { id: string; text: string }[];
	/**
	 * A finished block set in its place. Arranging joins it by an arrow to the block it follows and
	 * sets it out with the blocks of this voice note it is tied to, as a tree; otherwise whatever it
	 * grew onto moves down.
	 */
	settle(id: string, how: { follows?: string | null; arrange: boolean; session: string[] }): Promise<void>;
	/** What is on the table and what is selected, for a spoken command to act on. */
	read(): Promise<{ items: VoiceItem[]; selected: string[] }>;
	/** Carries out a spoken command, an operation at a time as the chat's are; resolves with those that were done. */
	run(ops: VoiceOp[]): Promise<VoiceOp[]>;
}

/** What these need of the table's editor module, which owns layout and the chat's operations. */
export interface TextBlockDeps {
	openSpot(editor: Editor, size: { w: number; h: number }): { x: number; y: number };
	/** Moves down whatever the shape lies on. */
	pushAside(editor: Editor, id: TLShapeId): void;
	perform(op: VoiceOp | Extract<TableOp, { op: 'read' }>): Promise<unknown>;
}

const GAP = GRID;
const long = (id: string) => (id.startsWith('shape:') ? id : `shape:${id}`) as TLShapeId;
const short = (id: string) => id.replace(/^shape:/, '');
const isText = (shape: TLShape | undefined): shape is TLTextShape => shape?.type === 'text';
const docOf = (shape: TLTextShape) => shape.props.richText as unknown as RichDoc;
const plain = (editor: Editor, shape: TLShape) => {
	const rich = (shape.props as { richText?: Parameters<typeof renderPlaintextFromRichText>[1] }).richText;
	return rich ? renderPlaintextFromRichText(editor, rich).replace(/\s+/g, ' ').trim() : '';
};

/**
 * Brings a shape into view if any of it lies outside: the view moves only as far as that takes,
 * so what was said before stays on screen. The table's toolbar floats over the bottom of the view.
 */
function reveal(editor: Editor, id: TLShapeId) {
	const bounds = editor.getShapePageBounds(id);
	if (!bounds) return;
	const view = editor.getViewportPageBounds(), zoom = editor.getZoomLevel();
	const edge = 40 / zoom, foot = 140 / zoom;
	const dx = bounds.maxX > view.maxX - edge ? bounds.maxX - (view.maxX - edge) : bounds.minX < view.minX + edge ? bounds.minX - (view.minX + edge) : 0;
	const dy = bounds.maxY > view.maxY - foot ? bounds.maxY - (view.maxY - foot) : bounds.minY < view.minY + edge ? bounds.minY - (view.minY + edge) : 0;
	if (!dx && !dy) return;
	const camera = editor.getCamera();
	editor.setCamera({ x: camera.x - dx, y: camera.y - dy, z: camera.z }, { animation: { duration: 220 } });
}

/** Brings a whole group into view when part of it isn't, zooming out if it has outgrown the view. Never zooms in. */
function revealAll(editor: Editor, ids: TLShapeId[]) {
	const bounds = editor.getShapesPageBounds(ids);
	if (!bounds) return;
	const view = editor.getViewportPageBounds(), zoom = editor.getZoomLevel();
	const inside = bounds.minX >= view.minX && bounds.maxX <= view.maxX && bounds.minY >= view.minY && bounds.maxY <= view.maxY - 140 / zoom;
	if (!inside) editor.zoomToBounds(bounds, { inset: 120, targetZoom: zoom, animation: { duration: 320 } });
}

const boxes = (editor: Editor, except: TLShapeId[] = []): Box[] =>
	editor.getCurrentPageShapes().flatMap((shape) => {
		if (except.includes(shape.id) || ['arrow', 'draw', 'line', 'highlight'].includes(shape.type)) return [];
		const bounds = editor.getShapePageBounds(shape);
		return bounds ? [{ id: short(shape.id), x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }] : [];
	});

/** Moves a shape so its bounds' top-left is at a place on the page. */
function moveTo(editor: Editor, shape: TLShape, to: { x: number; y: number }) {
	const bounds = editor.getShapePageBounds(shape);
	if (bounds) editor.updateShape({ id: shape.id, type: shape.type, x: shape.x + to.x - bounds.x, y: shape.y + to.y - bounds.y });
}

/**
 * A block drawn up under the one spoken before it. A block is set down under words that are still
 * arriving and may yet be corrected, so the room left between them is a guess until both have settled.
 */
function snug(editor: Editor, shape: TLShape, above: TLShape | undefined) {
	const here = editor.getShapePageBounds(shape), over = above && editor.getShapePageBounds(above);
	// Only where it was put: a block Casey has moved meanwhile stays where it is.
	if (!here || !over || Math.abs(here.x - over.x) > 1 || here.y < over.maxY) return;
	const start = { x: onGrid(over.x), y: upToGrid(over.maxY + GAP) };
	const spot = freeSpot(boxes(editor, [shape.id]), here, start);
	if (spot.x === start.x && spot.y < here.y) moveTo(editor, shape, spot);
}

/** The blocks of one voice note tied to a block by arrows, itself included. */
function tiedTo(editor: Editor, id: TLShapeId, session: Set<TLShapeId>): TLShapeId[] {
	const ties = editor.getCurrentPageShapes().filter((shape): shape is TLArrowShape => shape.type === 'arrow').flatMap((arrow) => {
		const ends = getArrowBindings(editor, arrow);
		return ends.start && ends.end && session.has(ends.start.toId) && session.has(ends.end.toId) ? [[ends.start.toId, ends.end.toId]] : [];
	});
	const found = new Set([id]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const [a, b] of ties) if (found.has(a) !== found.has(b)) grew = !!found.add(a).add(b);
	}
	return [...found];
}

export function voiceCanvas(editor: Editor, deps: TextBlockDeps): VoiceCanvas {
	const text = (id: string) => { const shape = editor.getShape(long(id)); return isText(shape) ? shape : undefined; };
	return {
		write(id, words, after) {
			const current = id ? text(id) : undefined;
			if (current) {
				editor.updateShape<TLTextShape>({ id: current.id, type: 'text', props: { richText: toRichText(words) } });
				return short(current.id);
			}
			const made = createShapeId();
			editor.markHistoryStoppingPoint('voice note');
			editor.run(() => {
				editor.createShape<TLTextShape>({ id: made, type: 'text', x: 0, y: 0, props: { richText: toRichText(words), autoSize: false, w: VOICE_BLOCK_WIDTH }, meta: { voice: true } });
				const size = editor.getShapePageBounds(made)!;
				const above = after ? editor.getShapePageBounds(long(after)) : undefined;
				// Under the block before it, in the nearest place nothing else stands; the first goes where there is room in view.
				const room = { w: size.w, h: Math.max(size.h, GRID * 4) };
				const spot = above ? freeSpot(boxes(editor, [made]), room, { x: onGrid(above.x), y: upToGrid(above.maxY + GAP) }) : deps.openSpot(editor, room);
				editor.updateShape({ id: made, type: 'text', x: spot.x, y: spot.y });
			});
			reveal(editor, made);
			return short(made);
		},
		rewrite(id, words, heard) {
			const shape = text(id);
			if (!shape || plain(editor, shape) !== heard.replace(/\s+/g, ' ').trim()) return false;
			editor.updateShape<TLTextShape>({ id: shape.id, type: 'text', props: { richText: toRichText(words) } });
			return true;
		},
		remove(id) {
			if (text(id)) editor.deleteShapes([long(id)]);
		},
		texts(limit = 40) {
			return editor.getCurrentPageShapesSorted().flatMap((shape) => {
				const words = editor.isShapeOfType(shape, BLOCK_SHAPE) ? String((shape.props as { title?: string }).title ?? '') : shape.type === 'arrow' || shape.type === 'frame' ? '' : plain(editor, shape);
				return words ? [{ id: short(shape.id), text: words.slice(0, 160) }] : [];
			}).slice(-limit);
		},
		async settle(id, { follows, arrange, session }) {
			const shape = text(id);
			if (!shape) return;
			const parent = arrange && follows && follows !== id ? editor.getShape(long(follows)) : undefined;
			if (!arrange) {
				snug(editor, shape, editor.getShape(long(session[session.indexOf(id) - 1] ?? '')));
				return deps.pushAside(editor, shape.id);
			}
			if (parent) await deps.perform({ op: 'connect', links: [{ from: short(parent.id), to: id }] });
			const tied = tiedTo(editor, shape.id, new Set(session.map(long)));
			if (tied.length > 1) {
				await deps.perform({ op: 'arrange', layout: 'tree', direction: 'down', ids: tied.map(short) });
				return revealAll(editor, tied);
			} else if (parent) {
				// The first block said about something already on the table goes beside it.
				const beside = editor.getShapePageBounds(parent)!, size = editor.getShapePageBounds(shape)!;
				moveTo(editor, shape, freeSpot(boxes(editor, [shape.id]), size, { x: onGrid(beside.maxX + GAP * 4), y: onGrid(beside.y) }));
			} else deps.pushAside(editor, shape.id);
			reveal(editor, shape.id);
		},
		async read() {
			const table = (await deps.perform({ op: 'read' })) as { items?: (VoiceItem & { title?: string })[]; selected?: string[] } | undefined;
			return { items: (table?.items ?? []).filter((item) => !['draw', 'line', 'highlight'].includes(item.type)).map(({ id, type, title, text, x, y, w, h, from, to, parent }) => ({ id, type, ...(title || text ? { text: title || text } : {}), x, y, w, h, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(parent ? { parent } : {}) })), selected: table?.selected ?? [] };
		},
		async run(ops) {
			const done: VoiceOp[] = [];
			for (const op of ops) {
				try { await deps.perform(op); done.push(op); } catch (error) { console.error('Voice command failed:', op.op, error); }
			}
			return done;
		}
	};
}

/**
 * One text block made part of another: its words follow the other's, arrows tied to it are tied
 * to the other instead (one that ran between the two goes), and it is removed. One undo divides them again.
 */
export function mergeTextBlocks(editor: Editor, fromId: TLShapeId, intoId: TLShapeId): boolean {
	const from = editor.getShape(fromId), into = editor.getShape(intoId);
	if (!isText(from) || !isText(into) || from.id === into.id) return false;
	editor.markHistoryStoppingPoint('combine text');
	editor.run(() => {
		editor.updateShape<TLTextShape>({ id: into.id, type: 'text', props: { richText: mergeRich(docOf(into), docOf(from)) as unknown as TLTextShape['props']['richText'] }, meta: { ...into.meta, ...(from.meta.voice ? { voice: true } : {}) } });
		for (const binding of editor.getBindingsToShape(from.id, 'arrow')) {
			const arrow = editor.getShape(binding.fromId);
			const ends = arrow?.type === 'arrow' ? getArrowBindings(editor, arrow as TLArrowShape) : undefined;
			const other = ends?.start?.id === binding.id ? ends.end : ends?.start;
			if (!arrow || other?.toId === into.id) { if (arrow) editor.deleteShapes([arrow.id]); continue; }
			const { id: _id, ...rest } = binding;
			editor.deleteBinding(binding);
			editor.createBinding({ ...rest, toId: into.id });
		}
		editor.deleteShapes([from.id]);
	});
	editor.select(into.id);
	return true;
}

/** The text block under a point other than the one being carried, topmost first. */
function textBlockAt(editor: Editor, point: { x: number; y: number }, carried: TLShapeId): TLTextShape | undefined {
	return editor.getCurrentPageShapesSorted().findLast((shape): shape is TLTextShape => isText(shape) && shape.id !== carried && !!editor.getShapePageBounds(shape)?.containsPoint(point));
}

/**
 * A text block divided at the caret: what comes before stays, what comes after becomes a new
 * block just below, which takes the caret. Returns whether it divided (Enter is left alone at the
 * very start of a block, inside a list, and while an input method is composing).
 */
export function splitTextBlock(editor: Editor, deps: Pick<TextBlockDeps, 'pushAside'>): boolean {
	const shape = editor.getEditingShape();
	const writing = editor.getRichTextEditor();
	if (!isText(shape) || !writing) return false;
	const { doc, selection } = writing.state;
	// Only between the lines of plain paragraphs: a list keeps Enter for its next item.
	if (selection.$from.depth !== 1 || selection.$from.parent.type.name !== 'paragraph') return false;
	const before = trimRich(doc.cut(0, selection.from).toJSON() as RichDoc), after = trimRich(doc.cut(selection.to).toJSON() as RichDoc);
	if (!renderPlaintextFromRichText(editor, before as never).trim()) return false;
	const made = createShapeId();
	editor.markHistoryStoppingPoint('divide text');
	editor.run(() => {
		// Its width is kept: a block that sized itself to one line would otherwise shrink to the words left.
		const width = editor.getShapeGeometry(shape).bounds.w;
		const { richText: _richText, ...look } = shape.props;
		editor.updateShape<TLTextShape>({ id: shape.id, type: 'text', props: { richText: before as never } });
		const height = editor.getShapeGeometry(shape.id).bounds.h * shape.props.scale;
		editor.createShape<TLTextShape>({ id: made, type: 'text', parentId: shape.parentId, x: shape.x, y: shape.y + Math.ceil((height + GAP) / GRID) * GRID, rotation: shape.rotation, props: { ...look, ...(look.autoSize ? {} : { w: width }), richText: after as never }, meta: shape.meta.voice ? { voice: true } : {} });
	});
	deps.pushAside(editor, made);
	startEditingShapeWithRichText(editor, made);
	// The caret goes to the start of what was carried down, as in any outline. tldraw puts it at the
	// end of a block it starts editing unless told where the pointer was, so it is told: the first line.
	requestAnimationFrame(() => {
		const bounds = editor.getShapePageBounds(made);
		if (bounds && editor.getEditingShapeId() === made) editor.emit('place-caret', { shapeId: made, point: editor.pageToScreen({ x: bounds.x + 1, y: bounds.y + 8 }) });
	});
	return true;
}

/**
 * Makes the table's text blocks combine when one is dropped on another, and divide on Enter.
 * While a lone text block is dragged over another, that one is outlined as where it will land.
 */
export function installTextBlocks(editor: Editor, deps: Pick<TextBlockDeps, 'pushAside'>): () => void {
	let carried: TLShapeId | undefined, target: TLShapeId | undefined;
	const clear = () => {
		if (target) editor.setHintingShapes([]);
		carried = target = undefined;
	};
	const onEvent = (info: TLEventInfo) => {
		if (info.type === 'pointer' && info.name === 'pointer_move') {
			const only = editor.isIn('select.translating') ? editor.getOnlySelectedShape() : undefined;
			if (!isText(only ?? undefined)) return clear();
			carried = only!.id;
			const over = textBlockAt(editor, editor.inputs.getCurrentPagePoint(), carried)?.id;
			if (over !== target) editor.setHintingShapes(over ? [over] : []);
			target = over;
		} else if (info.type === 'pointer' && info.name === 'pointer_up') {
			const from = carried, into = target;
			clear();
			if (from && into) mergeTextBlocks(editor, from, into);
		} else if (info.type === 'misc' && (info.name === 'cancel' || info.name === 'interrupt')) clear();
	};
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
		if (!splitTextBlock(editor, deps)) return;
		event.preventDefault();
		event.stopPropagation();
	};
	const container = editor.getContainer();
	editor.on('event', onEvent);
	container.addEventListener('keydown', onKey, true);
	return () => {
		editor.off('event', onEvent);
		container.removeEventListener('keydown', onKey, true);
		clear();
	};
}
