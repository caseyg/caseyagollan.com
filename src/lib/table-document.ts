/**
 * A table changed where it is saved, with no canvas open: the same operations the canvas takes
 * (`TableOp`, `TableEditor.tsx`), worked on the saved tldraw document's records. For the Claude
 * connector, whose model may ask for a change before (or without) a view of the table on screen.
 *
 * Nothing is drawn or measured here. Blocks, frames and notes keep their sizes in the document;
 * text is as tall as its words when drawn, so its height is worked out from them and is close,
 * not exact. The layouts are the canvas's own (`table-arrange`, `table-layout`), and so are the
 * shapes' props, written for the versions of tldraw's shapes named in `MADE_FOR`: a table saved by
 * another version still moves, edits and loses things, but nothing new is added to it until a
 * canvas has opened and saved it again.
 */
import { plainText, type TableItem, type TableLink, type TableNote, type TableOp, type TablePlace } from './table-agent';
import { arrange, clustersBy, labelIssues, routeArrows, usesArrows, type ArrowRoute, type DrawnArrow, type Edge } from './table-arrange';
import { blockProps, fitsToPost } from './table-block-props';
import { GRID, arrowCrossings, columnLayout, columnsLayout, gridLayout, layoutIssues, onGrid, rowLayout, tidyLayout, type Box, type Placement } from './table-layout';
import { BLOCK_SHAPE, type Block } from './tables';

/** The versions of tldraw's records the shapes made here are written for (`schema.sequences` of a saved document). */
export const MADE_FOR: Record<string, number> = {
	'com.tldraw.shape': 4,
	'com.tldraw.shape.text': 4,
	'com.tldraw.shape.note': 13,
	'com.tldraw.shape.arrow': 8,
	'com.tldraw.shape.frame': 1,
	'com.tldraw.shape.group': 0,
	'com.tldraw.shape.site-block': 3,
	'com.tldraw.binding.arrow': 1
};

/** A table as boxes and lines, for drawing a picture of it without a canvas. */
export interface TablePlan {
	cards: { n: number; id: string; type: string; kind: string; x: number; y: number; w: number; h: number; text: string; color: string; font: number }[];
	lines: { id: string; a: { x: number; y: number }; b: { x: number; y: number }; from: Box; to: Box; bend: number; label: string; labelPosition: number; dash: string; color: string; both: boolean }[];
	issues: ReturnType<typeof layoutIssues> & { crossings?: [string, string][]; labels_covered?: [string, string][]; labels_colliding?: [string, string][] };
}

/** The schema an empty table starts with: the canvas's own, as tldraw writes it (`tests/table-document.test.ts` holds it to that). */
export const SCHEMA = { schemaVersion: 2, sequences: { 'com.tldraw.store': 5, 'com.tldraw.asset': 1, 'com.tldraw.camera': 1, 'com.tldraw.document': 2, 'com.tldraw.instance': 26, 'com.tldraw.instance_page_state': 5, 'com.tldraw.page': 1, 'com.tldraw.instance_presence': 6, 'com.tldraw.pointer': 1, 'com.tldraw.shape': 4, 'com.tldraw.user': 1, 'com.tldraw.asset.image': 6, 'com.tldraw.asset.video': 5, 'com.tldraw.asset.bookmark': 2, 'com.tldraw.shape.arrow': 8, 'com.tldraw.shape.bookmark': 2, 'com.tldraw.shape.draw': 5, 'com.tldraw.shape.embed': 4, 'com.tldraw.shape.frame': 1, 'com.tldraw.shape.geo': 12, 'com.tldraw.shape.group': 0, 'com.tldraw.shape.highlight': 4, 'com.tldraw.shape.image': 5, 'com.tldraw.shape.line': 5, 'com.tldraw.shape.note': 13, 'com.tldraw.shape.text': 4, 'com.tldraw.shape.video': 4, 'com.tldraw.shape.site-block': 3, 'com.tldraw.binding.arrow': 1 } };

export const NEEDS_CANVAS = 'That needs the table open on a canvas. Open it with table_open (or ask Casey to open it on the site), then try again.';

type Shape = { id: string; typeName: 'shape'; type: string; x: number; y: number; parentId: string; index: string; rotation: number; isLocked: boolean; opacity: number; meta: Record<string, unknown>; props: Record<string, any> };
type Binding = { id: string; typeName: 'binding'; type: string; fromId: string; toId: string; meta: Record<string, unknown>; props: { terminal: 'start' | 'end'; normalizedAnchor: { x: number; y: number }; isExact: boolean; isPrecise: boolean; snap: string } };
type Point = { x: number; y: number };

const short = (id: string) => id.replace(/^shape:/, '');
const long = (id: string) => `shape:${short(id)}`;
const SOLID = (shape: Shape) => !['arrow', 'draw', 'line', 'highlight'].includes(shape.type);
const GAP = GRID;
const FRAME_PAD = 40;
const FRAME_LABEL = 40;
const FONT: Record<string, number> = { s: 18, m: 24, l: 36, xl: 44 };

export const toRichText = (text: string) => ({ type: 'doc', content: text.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })) });

/** How many lines words take in a width, wrapping between words, at a glyph width. */
function wrappedLines(text: string, width: number, glyph: number): number {
	const fits = Math.max(4, Math.floor(width / glyph));
	return text.split('\n').reduce((lines, paragraph) => {
		let count = 1, used = 0;
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			if (used && used + 1 + word.length > fits) { count++; used = 0; }
			used += (used ? 1 : 0) + word.length;
			while (used > fits) { count++; used -= fits; }
		}
		return lines + count;
	}, 0);
}

/** A text shape's size as drawn, near enough to lay things out by: the sans face at tldraw's sizes. */
export function textSize(props: { richText?: unknown; w?: number; autoSize?: boolean; size?: string; scale?: number }): { w: number; h: number } {
	const text = plainText(props.richText), scale = Number(props.scale) || 1;
	const font = FONT[props.size ?? 'm'] ?? 24, glyph = font * 0.54, line = font * 1.35;
	if (props.autoSize !== false) return { w: Math.max(8, Math.max(...text.split('\n').map((one) => one.length)) * glyph) * scale, h: text.split('\n').length * line * scale };
	const w = Number(props.w) || 8;
	return { w: w * scale, h: wrappedLines(text, w, glyph) * line * scale };
}

/** How far a sticky note grows past its square for its words. */
const noteGrowth = (text: string) => Math.max(0, wrappedLines(text, 168, 12) * 30 + 32 - 200);

/** A key that sorts after `key` among tldraw's fractional indexes. */
export function indexAbove(key: string | undefined): string {
	if (!key) return 'a1';
	const whole = key.charCodeAt(0) >= 97 ? key.charCodeAt(0) - 95 : 0;
	const last = key[key.length - 1];
	// Past the whole part, the last character can step up; otherwise a fraction is added.
	if (whole && key.length > whole && last !== 'z') { const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'; return key.slice(0, -1) + digits[digits.indexOf(last) + 1]; }
	return `${key}V`;
}

/** A key that sorts before `key`, when one is simple to make. */
export function indexBelow(key: string | undefined): string | undefined {
	if (!key) return 'a1';
	const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
	const last = key[key.length - 1];
	if (key.length < 2 || key.charCodeAt(0) < 97 || last === '0') return undefined;
	return `${key.slice(0, -1)}${digits[digits.indexOf(last) - 1]}V`;
}

export interface DocumentTableOptions {
	name?: string;
	/** New shapes' ids; random by default. */
	id?: () => string;
}

const randomId = () => { const bytes = crypto.getRandomValues(new Uint8Array(16)); const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'; return Array.from(bytes, (byte) => letters[byte % 64]).join('') + letters[bytes[0] % 52] + letters[bytes[1] % 52] + letters[bytes[2] % 52] + letters[bytes[3] % 52] + letters[bytes[4] % 52]; };

/**
 * A saved table's document, to change in place. `perform` answers as the canvas does and throws
 * what the canvas would say; `document()` is the changed document, and `changed()` whether it is.
 */
export function documentTable(source: unknown, options: DocumentTableOptions = {}) {
	// A table nothing has been put on yet has no document: it starts as the canvas would start it.
	const fresh = { store: { 'document:document': { gridSize: GRID, name: '', meta: {}, id: 'document:document', typeName: 'document' }, 'page:page': { meta: {}, id: 'page:page', name: 'Page 1', index: 'a1', typeName: 'page' } }, schema: SCHEMA };
	const doc = structuredClone((source as { store?: unknown } | null)?.store ? source : fresh) as { store: Record<string, any>; schema?: { sequences?: Record<string, number> } };
	const store = doc.store;
	// Records written by hand (an import, a test) may leave out what tldraw always writes.
	for (const record of Object.values(store)) if (record?.typeName === 'shape') { record.parentId ??= 'page:page'; record.index ??= 'a1'; record.props ??= {}; record.meta ??= {}; record.x = Number(record.x) || 0; record.y = Number(record.y) || 0; }
	const newId = options.id ?? randomId;
	let dirty = false;
	let name = options.name;

	const shapes = () => Object.values(store).filter((record): record is Shape => record?.typeName === 'shape');
	const bindings = () => Object.values(store).filter((record): record is Binding => record?.typeName === 'binding' && record.type === 'arrow');
	const page = () => (Object.values(store).find((record) => record?.typeName === 'page')?.id as string | undefined) ?? 'page:page';
	const get = (id: string | undefined): Shape | undefined => { const record = id ? store[long(id)] : undefined; return record?.typeName === 'shape' ? record : undefined; };
	const holder = (shape: Shape) => (shape.parentId.startsWith('shape:') ? get(shape.parentId) : undefined);
	const held = (id: string) => shapes().filter((shape) => shape.parentId === long(id)).sort((a, b) => (a.index < b.index ? -1 : 1));
	const ancestors = (shape: Shape): Shape[] => { const up = holder(shape); return up ? [up, ...ancestors(up)] : []; };
	/** Where a shape's parent's corner is on the page; a shape's own x and y are measured from it. */
	const corner = (shape: Shape): Point => { const up = holder(shape); if (!up) return { x: 0, y: 0 }; const from = corner(up); return { x: from.x + up.x, y: from.y + up.y }; };
	const sizeOf = (shape: Shape): { w: number; h: number } => {
		const props = shape.props;
		if (shape.type === 'text') return textSize(props);
		if (shape.type === 'note') return { w: 200 * (props.scale || 1), h: (200 + (Number(props.growY) || 0)) * (props.scale || 1) };
		if (shape.type === 'group') { const inner = held(shape.id).filter(SOLID).map(boxOf); return inner.length ? { w: Math.max(...inner.map((box) => box.x + box.w)) - Math.min(...inner.map((box) => box.x)), h: Math.max(...inner.map((box) => box.y + box.h)) - Math.min(...inner.map((box) => box.y)) } : { w: 1, h: 1 }; }
		return { w: Number(props.w) || 1, h: Number(props.h) || 1 };
	};
	const boxOf = (shape: Shape): Box => {
		const from = corner(shape);
		if (shape.type === 'group') { const inner = held(shape.id).filter(SOLID).map(boxOf); if (inner.length) { const x = Math.min(...inner.map((box) => box.x)), y = Math.min(...inner.map((box) => box.y)); return { id: short(shape.id), x, y, ...sizeOf(shape) }; } }
		return { id: short(shape.id), x: from.x + shape.x, y: from.y + shape.y, ...sizeOf(shape) };
	};
	const boxesOf = (list: Shape[]) => list.map(boxOf);
	const centreOf = (shape: Shape) => { const box = boxOf(shape); return { x: box.x + box.w / 2, y: box.y + box.h / 2 }; };
	/** A frame's box takes in its name, drawn above it, so nothing is set on the name. */
	const roomOf = (list: Shape[]) => boxesOf(list).map((box) => (get(box.id)?.type === 'frame' ? { ...box, y: box.y - FRAME_LABEL, h: box.h + FRAME_LABEL } : box));
	const unroomed = (placements: Placement[]) => placements.map((spot) => (get(spot.id)?.type === 'frame' ? { ...spot, y: spot.y + FRAME_LABEL } : spot));
	const moveTo = (shape: Shape, x: number, y: number) => { const now = boxOf(shape); shape.x += x - now.x; shape.y += y - now.y; dirty = true; };
	const place = (placements: Placement[]) => { for (const spot of placements) { const shape = get(spot.id); if (shape) moveTo(shape, spot.x, spot.y); } return placements.length; };
	const endsOf = (arrow: Shape) => { const mine = bindings().filter((binding) => binding.fromId === arrow.id); return { start: mine.find((binding) => binding.props.terminal === 'start'), end: mine.find((binding) => binding.props.terminal === 'end') }; };
	const arrows = () => shapes().filter((shape) => shape.type === 'arrow');
	/** Arrows keep where they start and end; set from the cards they are tied to, as the canvas would have left them. */
	const followArrows = () => {
		for (const arrow of arrows()) {
			const ends = endsOf(arrow), from = get(ends.start?.toId), to = get(ends.end?.toId);
			if (!from || !to) continue;
			const a = centreOf(from), b = centreOf(to), base = corner(arrow);
			arrow.x = a.x - base.x; arrow.y = a.y - base.y;
			arrow.props.start = { x: 0, y: 0 }; arrow.props.end = { x: b.x - a.x, y: b.y - a.y };
		}
	};
	const topIndex = (parent: string) => shapes().filter((shape) => shape.parentId === parent).reduce<string | undefined>((top, shape) => (!top || shape.index > top ? shape.index : top), undefined);
	const lowIndex = (parent: string) => shapes().filter((shape) => shape.parentId === parent).reduce<string | undefined>((low, shape) => (!low || shape.index < low ? shape.index : low), undefined);
	const madeFor = (...kinds: string[]) => {
		const saved = doc.schema?.sequences;
		if (!saved || kinds.some((kind) => saved[kind] !== MADE_FOR[kind])) throw new Error(`This table was saved by another version of the canvas, so new things can’t be added to it from here. ${NEEDS_CANVAS}`);
	};
	const create = (type: string, at: Point, props: Record<string, unknown>, meta: Record<string, unknown> = {}): Shape => {
		madeFor('com.tldraw.shape', `com.tldraw.shape.${type}`);
		const parentId = page();
		const shape: Shape = { x: at.x, y: at.y, rotation: 0, isLocked: false, opacity: 1, meta, id: `shape:${newId()}`, type, props, parentId, index: indexAbove(topIndex(parentId)), typeName: 'shape' };
		store[shape.id] = shape;
		dirty = true;
		return shape;
	};
	const remove = (shape: Shape) => {
		for (const inner of held(shape.id)) remove(inner);
		for (const binding of bindings()) if (binding.fromId === shape.id || binding.toId === shape.id) { const arrow = get(binding.fromId); delete store[binding.id]; if (arrow && arrow.id !== shape.id && binding.toId === shape.id) remove(arrow); }
		delete store[shape.id];
		dirty = true;
	};
	/** Puts shapes into a frame or group (or back on the page), keeping where they are on the page. */
	const reparent = (list: Shape[], parent: Shape | undefined) => {
		for (const shape of list) {
			const at = { x: corner(shape).x + shape.x, y: corner(shape).y + shape.y };
			shape.parentId = parent?.id ?? page();
			const from = corner(shape);
			shape.x = at.x - from.x; shape.y = at.y - from.y;
			shape.index = indexAbove(shapes().filter((other) => other !== shape && other.parentId === shape.parentId).reduce<string | undefined>((top, other) => (!top || other.index > top ? other.index : top), undefined));
		}
		dirty = true;
	};
	const fitFrame = (frame: Shape) => {
		const inner = held(frame.id).filter(SOLID);
		if (!inner.length) return;
		const boxes = boxesOf(inner);
		const x = Math.min(...boxes.map((box) => box.x)) - FRAME_PAD, y = Math.min(...boxes.map((box) => box.y)) - FRAME_PAD;
		const now = boxOf(frame), dx = x - now.x, dy = y - now.y;
		frame.x += dx; frame.y += dy;
		for (const shape of held(frame.id)) { shape.x -= dx; shape.y -= dy; }
		frame.props.w = Math.ceil((Math.max(...boxes.map((box) => box.x + box.w)) + FRAME_PAD - x) / GRID) * GRID;
		frame.props.h = Math.ceil((Math.max(...boxes.map((box) => box.y + box.h)) + FRAME_PAD - y) / GRID) * GRID;
		dirty = true;
	};
	/** A frame only draws what lies inside it: one whose items moved past its edge is refitted around them. */
	const wrapFrames = () => {
		for (const frame of shapes().filter((shape) => shape.type === 'frame')) {
			const { w, h } = frame.props;
			if (held(frame.id).filter(SOLID).some((shape) => { const size = sizeOf(shape); return shape.x < -1 || shape.y < -1 || shape.x + size.w > w + 1 || shape.y + size.h > h + 1; })) fitFrame(frame);
		}
	};

	const itemOf = (shape: Shape): TableItem => {
		const box = boxOf(shape), props = shape.props;
		const base = { id: short(shape.id), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), ...(shape.parentId.startsWith('shape:') ? { parent: short(shape.parentId) } : {}) };
		if (shape.type === BLOCK_SHAPE) return { ...base, type: String(props.kind), title: props.title, url: props.url, ...(props.excerpt ? { text: String(props.excerpt).slice(0, 200) } : {}), ...(props.image ? { image: props.image } : {}) };
		const text = shape.type === 'frame' ? props.name : plainText(props.richText);
		const ends = shape.type === 'arrow' ? endsOf(shape) : undefined;
		return { ...base, type: shape.type, ...(text ? { text: String(text).slice(0, 400) } : {}), ...(ends?.start ? { from: short(ends.start.toId) } : {}), ...(ends?.end ? { to: short(ends.end.toId) } : {}) };
	};
	const sorted = () => shapes().sort((a, b) => { const one = boxOf(a), other = boxOf(b); return one.y - other.y || one.x - other.x; });
	const items = () => sorted().map(itemOf);

	/** Each tied arrow as it is drawn: from where on each card, how curved, with what label. */
	const drawn = (): (DrawnArrow & { arrow: Shape })[] => arrows().flatMap((arrow) => {
		const ends = endsOf(arrow), from = get(ends.start?.toId), to = get(ends.end?.toId);
		if (!from || !to) return [];
		const point = (shape: Shape, binding: Binding) => { const box = boxOf(shape), anchor = binding.props.isPrecise ? binding.props.normalizedAnchor : { x: 0.5, y: 0.5 }; return { x: box.x + box.w * anchor.x, y: box.y + box.h * anchor.y }; };
		return [{ arrow, id: short(arrow.id), a: point(from, ends.start!), b: point(to, ends.end!), from: boxOf(from), to: boxOf(to), bend: arrow.props.kind === 'elbow' ? 0 : Number(arrow.props.bend) || 0, label: plainText(arrow.props.richText), labelPosition: Number(arrow.props.labelPosition ?? 0.5) }];
	});

	const issues = () => {
		const cards = shapes().filter(SOLID).filter((shape) => shape.type !== 'frame' && shape.type !== 'group');
		const boxes = boxesOf(cards);
		const found = layoutIssues(boxes);
		const lines = arrows().flatMap((arrow) => {
			const ends = endsOf(arrow), from = get(ends.start?.toId), to = get(ends.end?.toId);
			if (!from || !to || arrow.props.kind === 'elbow') return [];
			const a = centreOf(from), b = centreOf(to), bend = Number(arrow.props.bend) || 0;
			const skip = [from, to, ...ancestors(from), ...ancestors(to)].map((shape) => short(shape.id));
			const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
			const top = { x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * bend, y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * bend };
			return Math.abs(bend) < 20 ? [{ id: short(arrow.id), a, b, skip }] : [{ id: short(arrow.id), a, b: top, skip }, { id: short(arrow.id), a: top, b, skip }];
		});
		const seen = new Set<string>();
		const crossings = arrowCrossings(lines, boxes).filter((pair) => !seen.has(pair.join()) && !!seen.add(pair.join()));
		return { ...found, ...(crossings.length ? { crossings } : {}), ...labelIssues(boxes, drawn()) };
	};
	const changed = (result: Record<string, unknown>) => {
		wrapFrames();
		followArrows();
		const found = issues();
		const clean = !found.overlaps.length && !found.crowded.length && Object.keys(found).length === 2;
		return { ...result, ...(clean ? { layout: 'no overlaps' } : { issues: found }) };
	};

	const outermost = (list: Shape[]) => list.filter((shape) => !ancestors(shape).some((up) => list.includes(up)));
	/** The shapes named (a missing id is passed over), or everything on the page itself. */
	const shapesFor = (ids?: string[]) => (ids?.length ? ids.flatMap((id) => get(id) ?? []) : shapes().filter((shape) => !shape.parentId.startsWith('shape:')));
	const openSpot = (): Point => {
		const boxes = boxesOf(shapes().filter(SOLID));
		return boxes.length ? { x: onGrid(Math.min(...boxes.map((box) => box.x))), y: onGrid(Math.max(...boxes.map((box) => box.y + box.h)) + GAP * 2) } : { x: 0, y: 0 };
	};
	const originOf = (where: TablePlace): Point | undefined => {
		const anchor = get(where.below ?? where.right_of);
		if (anchor) { const box = boxOf(anchor); return where.below ? { x: box.x, y: box.y + box.h + GAP } : { x: box.x + box.w + GAP, y: box.y }; }
		return where.at;
	};
	const pushAside = (keep: string[]) => place(unroomed(tidyLayout(roomOf(shapesFor().filter(SOLID)), GAP, keep)).filter((move) => !keep.includes(move.id)));

	const newNote = (note: TableNote): Shape => {
		const text = String(note.text ?? '').slice(0, 2000);
		const color = note.color ?? 'white';
		if (note.style === 'text') return create('text', { x: 0, y: 0 }, { color, size: 'm', w: Math.max(160, Math.min(800, note.w ?? 360)), font: 'sans', textAlign: 'start', autoSize: false, scale: 1, richText: toRichText(text) });
		return create('note', { x: 0, y: 0 }, { color, labelColor: 'black', size: 'm', font: 'sans', fontSizeAdjustment: 0, align: 'middle', verticalAlign: 'middle', growY: noteGrowth(text), url: '', richText: toRichText(text), scale: 1, textLastEditedBy: null });
	};
	const addNotes = (op: { notes: TableNote[]; layout?: string; columns?: number } & TablePlace) => {
		const cells = op.notes.map((note) => (note.blank ? null : newNote(note)));
		const made = cells.filter((cell): cell is Shape => !!cell);
		if (!made.length) return made;
		const boxes: Box[] = cells.map((cell, index) => (cell ? { ...boxOf(cell), x: 0, y: 0 } : { id: `blank-${index}`, x: 0, y: 0, w: 200, h: 0 }));
		const columns = Math.max(1, Math.min(boxes.length, op.columns ?? Math.min(boxes.length, 4)));
		const origin = originOf(op) ?? openSpot();
		const at = { x: onGrid(origin.x), y: onGrid(origin.y) };
		place(op.layout === 'row' ? rowLayout(boxes, at, GAP) : op.layout === 'column' ? columnLayout(boxes, at, GAP) : op.layout === 'columns' ? columnsLayout(boxes, columns, at, GAP) : gridLayout(boxes, columns, at, GAP));
		pushAside(made.map((shape) => short(shape.id)));
		return made;
	};
	const connect = (links: TableLink[]) => {
		const added: string[] = [], missing: string[] = [];
		for (const link of links) {
			const from = get(link.from), to = get(link.to);
			if (!from || !to || from === to) { missing.push(`${link.from}→${link.to}`); continue; }
			madeFor('com.tldraw.binding.arrow');
			const a = centreOf(from), b = centreOf(to);
			const arrow = create('arrow', a, {
				kind: link.kind ?? 'arc', elbowMidPoint: 0.5, dash: link.dash ?? 'draw', size: 'm', fill: 'none', color: link.color ?? 'white', labelColor: 'black',
				bend: Math.max(-300, Math.min(300, link.bend ?? 0)), start: { x: 0, y: 0 }, end: { x: b.x - a.x, y: b.y - a.y },
				arrowheadStart: link.both_ends ? 'arrow' : 'none', arrowheadEnd: 'arrow', richText: toRichText((link.label ?? '').slice(0, 200)), labelPosition: 0.5, font: 'sans', scale: 1
			});
			for (const [terminal, target] of [['start', from], ['end', to]] as const) {
				const binding: Binding = { meta: {}, id: `binding:${newId()}`, type: 'arrow', fromId: arrow.id, toId: target.id, props: { isPrecise: false, isExact: false, normalizedAnchor: { x: 0.5, y: 0.5 }, snap: 'none', terminal }, typeName: 'binding' };
				store[binding.id] = binding;
			}
			added.push(short(arrow.id));
		}
		return { added, ...(missing.length ? { not_found: missing } : {}) };
	};
	const frame = (op: Extract<TableOp, { op: 'frame' }>) => {
		const inside = op.ids?.length ? outermost(shapesFor(op.ids)) : [];
		const boxes = boxesOf(inside.filter(SOLID));
		const around = boxes.length ? { x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)), maxX: Math.max(...boxes.map((box) => box.x + box.w)), maxY: Math.max(...boxes.map((box) => box.y + box.h)) } : null;
		const spot = around ? undefined : op.at ?? openSpot();
		const x = around ? onGrid(around.x - FRAME_PAD) : onGrid(spot!.x), y = around ? onGrid(around.y - FRAME_PAD) : onGrid(spot!.y);
		const made = create('frame', { x, y }, { w: around ? Math.ceil((around.maxX + FRAME_PAD - x) / GRID) * GRID : Math.max(120, op.w ?? 400), h: around ? Math.ceil((around.maxY + FRAME_PAD - y) / GRID) * GRID : Math.max(120, op.h ?? 300), name: op.name.slice(0, 120), color: op.color ?? 'white' });
		// A frame is drawn under what it holds, and under arrows that cross it.
		made.index = indexBelow(lowIndex(made.parentId)) ?? made.index;
		if (inside.length) reparent(inside, made);
		return { added: [short(made.id)], holds: inside.map((shape) => short(shape.id)) };
	};

	/** One level of the table set out by `arrange`: these shapes as boxes, the arrows tied to them (or to what they hold) as the graph. */
	const arrangement = (list: Shape[], op: Extract<TableOp, { op: 'arrange' }>, at?: Point) => {
		const within = (id: string | undefined): string | undefined => { const shape = get(id); const top = shape && (list.includes(shape) ? shape : ancestors(shape).reverse().find((up) => list.includes(up))); return top ? short(top.id) : undefined; };
		const links = arrows().flatMap((arrow) => { const ends = endsOf(arrow); const from = within(ends.start?.toId), to = within(ends.end?.toId); return from && to && from !== to ? [{ arrow, ends, from, to }] : []; });
		const edges: Edge[] = links.map(({ from, to }) => ({ from, to }));
		const groups = op.layout !== 'cluster' ? undefined : op.groups?.length ? op.groups.map((group) => ({ ...group, ids: group.ids.flatMap((id) => within(id) ?? []) })) : clustersBy(list.map((shape) => ({ id: short(shape.id), kind: itemOf(shape).type, color: shape.props.color })), op.by ?? 'kind', edges);
		const gap = Math.max(0, Math.min(200, op.gap ?? GAP));
		const result = arrange({ mode: op.layout, boxes: roomOf(list), edges, at, gap, ordered: op.ordered, columns: op.columns, direction: op.direction, root: op.root ? within(op.root) : undefined, groups, clusterGap: op.frame === false ? 120 : 200, headings: list.filter((shape) => shape.type === 'text').map((shape) => short(shape.id)) });
		const placements = unroomed(result.placements);
		const restyle = op.arrows === 'straight' || op.arrows === 'elbow' || (op.arrows !== 'keep' && usesArrows(result.mode));
		const going = new Map(placements.map((spot) => [spot.id, spot]));
		const landed = boxesOf(list).map((box) => ({ ...box, ...going.get(box.id) }));
		const routes = restyle ? routeArrows(landed, links.map(({ arrow, from, to }) => ({ id: arrow.id, from, to, label: plainText(arrow.props.richText) })), { elbow: op.arrows === 'elbow' }) : [];
		const restyled = () => { for (const route of routes) applyRoute(route, links.find((link) => link.arrow.id === route.id)!, op.arrows === 'elbow'); };
		return { result, placements, restyled, gap };
	};
	/** An arrow takes its route; its ends fan out only where they are tied to the cards that were set out, not to something inside one. */
	const applyRoute = (route: ArrowRoute, link: { arrow: Shape; ends: ReturnType<typeof endsOf>; from: string; to: string }, elbow: boolean) => {
		link.arrow.props.bend = route.bend;
		link.arrow.props.labelPosition = route.labelPosition;
		if (elbow) link.arrow.props.kind = 'elbow';
		for (const [binding, holder, anchor, precise] of [[link.ends.start, link.from, route.start, route.startPrecise], [link.ends.end, link.to, route.end, route.endPrecise]] as const) {
			if (!binding || short(binding.toId) !== holder) continue;
			binding.props.normalizedAnchor = { ...anchor };
			binding.props.isPrecise = precise;
		}
		dirty = true;
	};
	const arrangeOp = (op: Extract<TableOp, { op: 'arrange' }>) => {
		const named = op.ids?.length ? shapesFor(op.ids) : [];
		const called = (title: string) => shapes().find((shape) => shape.type === 'frame' && String(shape.props.name).trim().toLowerCase() === title.trim().toLowerCase());
		const only = op.inside ? get(op.inside) ?? called(op.inside) : named.length === 1 ? named[0] : undefined;
		const holding = only?.type === 'frame' ? only : undefined;
		if (op.inside && !holding) return { arranged: 0, note: '`inside` takes the id or the name of a frame on the table.' };
		const done: Record<string, unknown> = {};
		let count: number;
		let plan: ReturnType<typeof arrangement>;
		if (holding) {
			const inner = held(holding.id).filter(SOLID), box = boxOf(holding);
			plan = arrangement(inner, op, originOf(op) ?? { x: box.x + FRAME_PAD, y: box.y + FRAME_PAD });
			place(plan.placements); plan.restyled();
			fitFrame(holding);
			const around = shapes().filter((shape) => shape.parentId === holding.parentId).filter(SOLID);
			place(unroomed(tidyLayout(roomOf(around), GAP, [short(holding.id)]).filter((move) => move.id !== short(holding.id))));
			count = inner.length;
			done.inside = short(holding.id);
		} else {
			if (!named.length && op.layout === 'auto') {
				const frames = shapesFor().filter((shape) => shape.type === 'frame' && held(shape.id).filter(SOLID).length > 1);
				for (const inner of frames) { const box = boxOf(inner); const within = arrangement(held(inner.id).filter(SOLID), { op: 'arrange', layout: 'auto', gap: op.gap }, { x: box.x + FRAME_PAD, y: box.y + FRAME_PAD }); place(within.placements); within.restyled(); fitFrame(inner); }
				if (frames.length) done.frames_tidied = frames.length;
			}
			const turn = new Map((op.ordered ? op.ids ?? [] : []).map((id, index) => [short(id), index]));
			const list = outermost(shapesFor(op.ids).filter(SOLID)).sort((a, b) => (turn.get(short(a.id)) ?? 0) - (turn.get(short(b.id)) ?? 0));
			plan = arrangement(list, op, originOf(op));
			const parents = new Set(list.map((shape) => shape.parentId));
			const moving = new Map(plan.result.placements.map((spot) => [spot.id, spot]));
			const beside = parents.size === 1 ? shapes().filter((shape) => shape.parentId === list[0].parentId).filter(SOLID) : [];
			const pushed = unroomed(tidyLayout(roomOf(beside).map((box) => ({ ...box, ...moving.get(box.id) })), plan.gap, moving.keys()).filter((move) => !moving.has(move.id)));
			place([...plan.placements, ...pushed]); plan.restyled();
			count = list.length;
			if (pushed.length) done.pushed_aside = pushed.length;
			const framed = (plan.result.groups ?? []).filter((group) => group.name && op.frame !== false);
			if (framed.length && list.every((shape) => !shape.parentId.startsWith('shape:'))) done.frames = framed.map((group) => ({ name: group.name, id: frame({ op: 'frame', name: group.name!, ids: group.ids }).added[0], holds: group.ids.length }));
			else if (plan.result.groups) done.groups = plan.result.groups.map((group) => ({ ...(group.name ? { name: group.name } : {}), holds: group.ids.length }));
		}
		return changed({ arranged: count, as: plan.result.mode, ...done, ...(plan.result.note ? { note: plan.result.note } : {}) });
	};

	function perform(op: TableOp): unknown {
		switch (op.op) {
			case 'read': return { ...(name ? { name } : {}), items: items(), selected: [], issues: issues(), note: 'As last saved: no canvas is open. Text sizes are worked out, not measured.' };
			case 'look': {
				const solid = shapesFor(op.ids).filter(SOLID);
				return { key: solid.map((shape, index) => { const item = itemOf(shape); return { n: index + 1, id: item.id, type: item.type, ...(item.title ? { title: item.title.slice(0, 80) } : item.text ? { title: item.text.slice(0, 60) } : {}) }; }), issues: issues() };
			}
			case 'add_blocks': {
				if (!op.blocks.length) return changed({ added: [] });
				const columns = Math.max(1, op.columns ?? Math.min(op.blocks.length, 4));
				const origin = op.at ? { x: onGrid(op.at.x), y: onGrid(op.at.y) } : openSpot();
				let x = origin.x, y = origin.y, row = 0;
				const made = op.blocks.map((block: Block, index) => {
					if (index && index % columns === 0) { x = origin.x; y += row + GAP; row = 0; }
					const size = op.sizes?.[index];
					const props = { ...blockProps(block), ...(size ? { w: Math.max(40, Math.round(size.w)), h: Math.max(40, Math.round(size.h)) } : {}), ...(op.plain ? { hideMeta: true } : {}) };
					const shape = create(BLOCK_SHAPE, { x, y }, props, fitsToPost(block) ? { fit: true } : {});
					x += props.w + GAP; row = Math.max(row, props.h);
					return shape;
				});
				if (op.at) pushAside(made.map((shape) => short(shape.id)));
				return changed({ added: made.map((shape) => short(shape.id)) });
			}
			case 'add_note': {
				const [made] = addNotes({ notes: [op], at: op.at, below: op.below, right_of: op.right_of });
				const report = changed({});
				const box = boxOf(made);
				return { added: [{ id: short(made.id), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) }], ...report };
			}
			case 'add_notes': return changed({ added: addNotes(op).map((shape) => short(shape.id)) });
			case 'move': {
				const depth = (move: { id: string }) => { const shape = get(move.id); return shape ? ancestors(shape).length : 0; };
				let moved = 0;
				for (const move of op.moves.toSorted((a, b) => depth(a) - depth(b))) {
					const shape = get(move.id);
					if (!shape) continue;
					if ((shape.type === BLOCK_SHAPE || shape.type === 'text') && (move.w || move.h)) {
						if (move.w) shape.props.w = onGrid(move.w);
						if (move.h && shape.type !== 'text') shape.props.h = onGrid(move.h);
						if (shape.type === 'text') shape.props.autoSize = false;
					}
					const now = boxOf(shape);
					moveTo(shape, move.x === undefined ? now.x : onGrid(move.x), move.y === undefined ? now.y : onGrid(move.y));
					moved++;
				}
				return changed({ moved });
			}
			case 'arrange': return arrangeOp(op);
			case 'align': {
				const list = outermost(shapesFor(op.ids).filter(SOLID));
				if (list.length < 2) return { aligned: 0, note: 'Name at least two items.' };
				const boxes = boxesOf(list);
				const left = Math.min(...boxes.map((box) => box.x)), right = Math.max(...boxes.map((box) => box.x + box.w)), top = Math.min(...boxes.map((box) => box.y)), bottom = Math.max(...boxes.map((box) => box.y + box.h));
				const aligned = (box: Box): Point => op.align === 'left' ? { x: left, y: box.y } : op.align === 'right' ? { x: right - box.w, y: box.y } : op.align === 'center-horizontal' ? { x: (left + right - box.w) / 2, y: box.y } : op.align === 'top' ? { x: box.x, y: top } : op.align === 'bottom' ? { x: box.x, y: bottom - box.h } : op.align === 'center-vertical' ? { x: box.x, y: (top + bottom - box.h) / 2 } : { x: box.x, y: box.y };
				place(boxes.map((box) => ({ id: box.id, ...aligned(box) })));
				if (op.distribute && list.length > 2) {
					const axis = op.distribute === 'horizontal' ? 'x' : 'y', side = axis === 'x' ? 'w' : 'h';
					const line = boxesOf(list).sort((a, b) => a[axis] - b[axis]);
					const first = line[0], last = line[line.length - 1];
					const free = last[axis] + last[side] - first[axis] - line.reduce((sum, box) => sum + box[side], 0);
					let at = first[axis];
					place(line.map((box) => { const spot = { id: box.id, x: box.x, y: box.y, [axis]: at }; at += box[side] + free / (line.length - 1); return spot; }));
				}
				return changed({ aligned: list.length });
			}
			case 'tidy': {
				const list = outermost(shapesFor(op.ids).filter(SOLID));
				const moved = place(tidyLayout(boxesOf(list)));
				// Arrows among them run again where things now stand: ends fanned out, curves around cards in the way, labels apart.
				const cards = list.flatMap((shape) => (shape.type === 'frame' || shape.type === 'group' ? held(shape.id) : [shape])).filter((shape) => SOLID(shape) && shape.type !== 'frame' && shape.type !== 'group');
				const links = arrows().filter((arrow) => arrow.props.kind !== 'elbow').flatMap((arrow) => { const ends = endsOf(arrow), from = get(ends.start?.toId), to = get(ends.end?.toId); return from && to && from !== to && cards.includes(from) && cards.includes(to) ? [{ arrow, ends, from: short(from.id), to: short(to.id) }] : []; });
				for (const route of routeArrows(boxesOf(cards), links.map(({ arrow, from, to }) => ({ id: arrow.id, from, to, label: plainText(arrow.props.richText) })))) applyRoute(route, links.find((link) => link.arrow.id === route.id)!, false);
				return changed({ moved, arrows_routed: links.length });
			}
			case 'connect': return changed(connect(op.links));
			case 'frame': return changed(frame(op));
			case 'group': {
				const list = outermost(shapesFor(op.ids));
				if (list.length < 2) return { grouped: 0, note: 'Name at least two items.' };
				const boxes = boxesOf(list.filter(SOLID));
				const group = create('group', { x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)) }, {});
				reparent(list, group);
				return { group: short(group.id), holds: list.map((shape) => short(shape.id)) };
			}
			case 'ungroup': {
				const list = shapesFor(op.ids).filter((shape) => shape.type === 'group' || shape.type === 'frame');
				for (const shape of list) { reparent(held(shape.id), holder(shape)); delete store[shape.id]; }
				dirty ||= list.length > 0;
				return { ungrouped: list.length };
			}
			case 'set_blocks': {
				const skipped: string[] = [];
				let relinked = 0;
				for (const { id, block } of op.cards) {
					const shape = get(id);
					if (!shape || shape.type !== BLOCK_SHAPE) { skipped.push(id); continue; }
					const { w: _w, h: _h, hideMeta: _hideMeta, ...props } = blockProps({ ...block, ref: block.ref ?? (shape.props.ref || undefined) });
					Object.assign(shape.props, props);
					if (fitsToPost(block)) shape.meta = { ...shape.meta, fit: true };
					relinked++;
				}
				dirty ||= relinked > 0;
				return changed({ relinked, ...(skipped.length ? { skipped } : {}) });
			}
			case 'edit': {
				let edited = 0;
				for (const { id, text, color } of op.edits) {
					const shape = get(id);
					if (!shape || shape.type === BLOCK_SHAPE) continue;
					let did = false;
					if (text !== undefined) {
						if (shape.type === 'frame') { shape.props.name = text.slice(0, 120); did = true; }
						else if ('richText' in shape.props) { shape.props.richText = toRichText(text.slice(0, 2000)); if (shape.type === 'note') shape.props.growY = noteGrowth(text); did = true; }
					}
					if (color && 'color' in shape.props) { shape.props.color = color; did = true; }
					if (did) edited++;
				}
				dirty ||= edited > 0;
				return changed({ edited });
			}
			case 'remove': {
				const list = op.ids.length ? shapesFor(op.ids) : [];
				for (const shape of list) if (store[shape.id]) remove(shape);
				followArrows();
				return { removed: list.length };
			}
			case 'select': return { selected: shapesFor(op.ids).length, note: 'No canvas is open, so nothing is shown selected.' };
			case 'rename': name = op.name; return { name };
		}
		throw new Error(NEEDS_CANVAS);
	}

	/** What a picture of the table needs (`table-plan.ts`): each card with its words and colour, each arrow with where it runs. */
	const plan = (ids?: string[]): TablePlan => {
		const shown = ids?.length ? new Set(shapesFor(ids).flatMap((shape) => [shape, ...held(shape.id)]).map((shape) => shape.id)) : undefined;
		const solid = sorted().filter(SOLID).filter((shape) => !shown || shown.has(shape.id));
		const cards = solid.map((shape, index) => { const item = itemOf(shape); return { n: index + 1, id: item.id, type: shape.type, kind: item.type, x: item.x, y: item.y, w: item.w, h: item.h, text: shape.type === BLOCK_SHAPE ? [item.title, item.text].filter(Boolean).join('\n') : item.text ?? '', color: String(shape.props.color ?? ''), font: (FONT[shape.props.size ?? 'm'] ?? 24) * (Number(shape.props.scale) || 1) }; });
		const lines = drawn().filter((line) => !shown || (shown.has(long(line.from.id)) && shown.has(long(line.to.id)))).map(({ arrow, ...line }) => ({ ...line, label: line.label ?? '', labelPosition: line.labelPosition ?? 0.5, dash: String(arrow.props.dash ?? ''), color: String(arrow.props.color ?? ''), both: arrow.props.arrowheadStart !== 'none' }));
		return { cards, lines, issues: issues() };
	};

	return { perform, document: () => doc as unknown, changed: () => dirty, items, name: () => name, plan };
}

export type DocumentTable = ReturnType<typeof documentTable>;
