/**
 * Laying out a table's items from their real sizes: the maths behind the assistant's
 * `arrange` and `tidy`, and the checks it gets back after each change. Pure, so the canvas
 * (browser) and the tests share it; the canvas measures each shape (`getShapePageBounds`,
 * which includes a note's growth with its text) and moves it by how far its bounds must go.
 */

export interface Box { id: string; x: number; y: number; w: number; h: number }
export type Placement = { id: string; x: number; y: number };

/** The dot grid's spacing; things are set out a grid step apart. */
export const GRID = 20;
export const onGrid = (value: number) => Math.round(value / GRID) * GRID;
/** Up to the next grid line, so a measured size is never rounded smaller than it is. */
export const upToGrid = (value: number) => Math.ceil(value / GRID - 1e-6) * GRID;

const readingOrder = (a: Box, b: Box) => a.y - b.y || a.x - b.x;
const topLeft = (boxes: Box[]) => ({ x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)) });

/**
 * A true grid: each column as wide as its widest item, each row as tall as its tallest, so
 * columns line up whatever the items' sizes. Items keep reading order and sit at their
 * cell's top-left.
 */
export function gridLayout(boxes: Box[], columns: number, at?: { x: number; y: number }, gap = GRID): Placement[] {
	if (!boxes.length) return [];
	const sorted = [...boxes].sort(readingOrder);
	const cols = Math.max(1, Math.min(columns, sorted.length));
	const origin = at ?? topLeft(sorted);
	const widths = Array.from({ length: cols }, (_, col) => Math.max(...sorted.filter((_, index) => index % cols === col).map((box) => upToGrid(box.w))));
	const rows = Math.ceil(sorted.length / cols);
	const heights = Array.from({ length: rows }, (_, row) => Math.max(...sorted.slice(row * cols, row * cols + cols).map((box) => upToGrid(box.h))));
	const left = (col: number) => widths.slice(0, col).reduce((sum, width) => sum + width + gap, 0);
	const top = (row: number) => heights.slice(0, row).reduce((sum, height) => sum + height + gap, 0);
	return sorted.map((box, index) => ({ id: box.id, x: onGrid(origin.x) + left(index % cols), y: onGrid(origin.y) + top(Math.floor(index / cols)) }));
}

/** One row, left to right, tops aligned. */
export const rowLayout = (boxes: Box[], at?: { x: number; y: number }, gap = GRID) => gridLayout(boxes, boxes.length, at, gap);

/** One column, top to bottom, each item a gap below the real bottom of the one above. */
export const columnLayout = (boxes: Box[], at?: { x: number; y: number }, gap = GRID) => gridLayout(boxes, 1, at, gap);

/**
 * Masonry: `columns` equal-width columns, each item dropped into the shortest one, so cards
 * of different heights stack without the gaps a grid leaves. Best for notes and text.
 */
export function columnsLayout(boxes: Box[], columns: number, at?: { x: number; y: number }, gap = GRID): Placement[] {
	if (!boxes.length) return [];
	const sorted = [...boxes].sort(readingOrder);
	const cols = Math.max(1, Math.min(columns, sorted.length));
	const origin = at ?? topLeft(sorted);
	const width = Math.max(...sorted.map((box) => upToGrid(box.w)));
	const bottoms = new Array<number>(cols).fill(onGrid(origin.y));
	return sorted.map((box) => {
		const col = bottoms.indexOf(Math.min(...bottoms));
		const y = bottoms[col];
		bottoms[col] = y + upToGrid(box.h) + gap;
		return { id: box.id, x: onGrid(origin.x) + col * (width + gap), y };
	});
}

/** How much two boxes overlap, as the smaller of the overlap's width and height (0 when apart). */
function overlapDepth(a: Box, b: Box, margin = 0): number {
	const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + margin;
	const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + margin;
	return dx > 0 && dy > 0 ? Math.min(dx, dy) : 0;
}

/**
 * Pushes overlapping items apart with the least movement: in reading order, each item that
 * covers (or sits closer than `gap` to) one already settled moves down below it. Columns stay
 * columns; nothing moves up or sideways. `keep` (an item, or several, just put somewhere on purpose)
 * settles first, so what it lands on moves instead of it. Returns only the items that moved.
 */
export function tidyLayout(boxes: Box[], gap = GRID, keep?: string | Iterable<string>): Placement[] {
	const kept = new Set(typeof keep === 'string' ? [keep] : keep ?? []);
	const settled: Box[] = [];
	const moved: Placement[] = [];
	for (const box of [...boxes].sort((a, b) => Number(kept.has(b.id)) - Number(kept.has(a.id)) || readingOrder(a, b))) {
		const next = { ...box };
		for (let guard = 0; guard < boxes.length + 1; guard++) {
			const hit = settled.filter((other) => overlapDepth(next, other, gap) > 0).sort((a, b) => b.y + b.h - (a.y + a.h))[0];
			if (!hit) break;
			next.y = upToGrid(hit.y + hit.h + gap);
		}
		settled.push(next);
		if (next.y !== box.y) moved.push({ id: box.id, x: next.x, y: next.y });
	}
	return moved;
}

export interface LayoutIssues {
	/** Pairs of items drawn on top of each other, and by how much (canvas units). */
	overlaps: { ids: [string, string]; by: number }[];
	/** Pairs that touch or nearly do: less than half a grid step apart. */
	crowded: [string, string][];
	/** Arrows drawn through a card they don't join: [arrow, card]. */
	crossings?: [string, string][];
}

/**
 * What's wrong with a layout, from the items' measured bounds: overlaps first (they hide
 * text), then items crammed together. Arrows and drawings are left out by the caller.
 */
export function layoutIssues(boxes: Box[]): LayoutIssues {
	const overlaps: LayoutIssues['overlaps'] = [];
	const crowded: LayoutIssues['crowded'] = [];
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			const [a, b] = [boxes[i], boxes[j]];
			const by = overlapDepth(a, b);
			// A shape wholly inside a bigger one (a label on a card, say) is meant, not a mistake.
			const inside = (inner: Box, outer: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
			if (by > 2 && !inside(a, b) && !inside(b, a)) overlaps.push({ ids: [a.id, b.id], by: Math.round(by) });
			else if (!by && overlapDepth(a, b, GRID / 2) > 0) crowded.push([a.id, b.id]);
		}
	}
	return { overlaps: overlaps.sort((a, b) => b.by - a.by).slice(0, 30), crowded: crowded.slice(0, 30) };
}

/** Whether the straight line from a to b passes through a box (shrunk by `inset`, so grazing an edge doesn't count). */
export function segmentHitsBox(a: { x: number; y: number }, b: { x: number; y: number }, box: Box, inset = 6): boolean {
	const [minX, minY, maxX, maxY] = [box.x + inset, box.y + inset, box.x + box.w - inset, box.y + box.h - inset];
	if (minX >= maxX || minY >= maxY) return false;
	// Liang–Barsky: clip the segment to the box; it hits if anything is left.
	let t0 = 0, t1 = 1;
	const dx = b.x - a.x, dy = b.y - a.y;
	for (const [p, q] of [[-dx, a.x - minX], [dx, maxX - a.x], [-dy, a.y - minY], [dy, maxY - a.y]]) {
		if (p === 0) { if (q < 0) return false; continue; }
		const t = q / p;
		if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
		else { if (t < t0) return false; if (t < t1) t1 = t; }
	}
	return t0 < t1;
}

/**
 * Arrows that run through cards they don't join, which hides those cards' text: each arrow
 * as the straight line between the centres of what it joins, and the items it may cross
 * (`skip` names its own ends and the frames they sit in).
 */
export function arrowCrossings(arrows: { id: string; a: { x: number; y: number }; b: { x: number; y: number }; skip: string[] }[], boxes: Box[]): [string, string][] {
	const crossings: [string, string][] = [];
	for (const arrow of arrows) for (const box of boxes) if (!arrow.skip.includes(box.id) && segmentHitsBox(arrow.a, arrow.b, box)) crossings.push([arrow.id, box.id]);
	return crossings.slice(0, 30);
}

/**
 * How far to bend an arrow from a to b so it clears the cards in its way: 0 when the straight
 * line is clear, else the gentlest curve (either side) that is, taken as two straight runs
 * through the top of the curve, as `arrowCrossings` is fed. 0 again when no curve clears it.
 */
export function bendAround(a: { x: number; y: number }, b: { x: number; y: number }, boxes: Box[]): number {
	const length = Math.hypot(b.x - a.x, b.y - a.y);
	if (length < 1) return 0;
	const clear = (bend: number) => {
		if (!bend) return !boxes.some((box) => segmentHitsBox(a, b, box));
		const top = { x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * bend, y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * bend };
		return !boxes.some((box) => segmentHitsBox(a, top, box) || segmentHitsBox(top, b, box));
	};
	for (const bend of [0, 80, -80, 140, -140, 200, -200, 260, -260, 300, -300]) if (Math.abs(bend) < length && clear(bend)) return bend;
	return 0;
}
