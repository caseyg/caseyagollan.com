/*
 * A table's picture for the browse page, drawn from its saved canvas: every block, note, text and
 * frame as a plain rounded box where it sits, and every arrow as a curve from edge to edge, as
 * Obsidian draws its Canvas previews. Pure, so the server draws it for any saved table and the
 * demo draws it in the browser. Shown as an image, so its colours are literal, not design tokens.
 */

interface Box {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Frames are outlined, not filled. */
	frame?: boolean;
}

interface Point {
	x: number;
	y: number;
}

interface Connector {
	from: Point | Box;
	to: Point | Box;
}

type Shape = { id: string; typeName: 'shape'; type: string; x: number; y: number; parentId?: string; props?: Record<string, unknown> };
type Binding = { typeName: 'binding'; type: string; fromId: string; toId: string; props?: { terminal?: string } };

const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** A shape's size, from its props where tldraw keeps one; notes and text have their own. */
function size(shape: Shape): { w: number; h: number } | null {
	const props = shape.props ?? {};
	const scale = num(props.scale, 1);
	if (shape.type === 'note') return { w: 200 * scale, h: Math.max(200, num(props.growY, 0) + 200) * scale };
	if (shape.type === 'text') return { w: num(props.w, 160) * scale, h: 40 * scale };
	if (shape.type === 'arrow' || shape.type === 'draw' || shape.type === 'line' || shape.type === 'highlight' || shape.type === 'group') return null;
	const w = num(props.w, 0);
	const h = num(props.h, 0) + num(props.growY, 0);
	return w > 0 && h > 0 ? { w, h } : null;
}

/** Reads the boxes and connectors out of a tldraw document; anything it doesn't know is left out. */
export function tableLayout(document: unknown): { boxes: Box[]; connectors: Connector[] } {
	const store = (document as { store?: Record<string, unknown> } | null)?.store;
	if (!store || typeof store !== 'object') return { boxes: [], connectors: [] };
	const records = Object.values(store) as (Shape | Binding | { typeName?: string })[];
	const shapes = new Map<string, Shape>();
	for (const record of records) if (record?.typeName === 'shape') shapes.set((record as Shape).id, record as Shape);

	// Shapes inside frames and groups are placed relative to them.
	const origin = (shape: Shape, depth = 0): Point => {
		const parent = shape.parentId ? shapes.get(shape.parentId) : undefined;
		const base = parent && depth < 8 ? origin(parent, depth + 1) : { x: 0, y: 0 };
		return { x: base.x + num(shape.x, 0), y: base.y + num(shape.y, 0) };
	};

	const boxes = new Map<string, Box>();
	for (const shape of shapes.values()) {
		const found = size(shape);
		if (!found) continue;
		const at = origin(shape);
		boxes.set(shape.id, { id: shape.id, ...at, ...found, frame: shape.type === 'frame' });
	}

	const bound = new Map<string, Box>();
	for (const record of records) {
		if (record?.typeName !== 'binding' || (record as Binding).type !== 'arrow') continue;
		const binding = record as Binding;
		const box = boxes.get(binding.toId);
		if (box) bound.set(`${binding.fromId} ${binding.props?.terminal}`, box);
	}

	const connectors: Connector[] = [];
	for (const shape of shapes.values()) {
		if (shape.type !== 'arrow') continue;
		const at = origin(shape);
		const end = (terminal: 'start' | 'end'): Point | Box => {
			const box = bound.get(`${shape.id} ${terminal}`);
			if (box) return box;
			const point = (shape.props?.[terminal] ?? {}) as Partial<Point>;
			return { x: at.x + num(point.x, 0), y: at.y + num(point.y, 0) };
		};
		connectors.push({ from: end('start'), to: end('end') });
	}
	return { boxes: [...boxes.values()], connectors };
}

const isBox = (end: Point | Box): end is Box => 'w' in end;
const centre = (end: Point | Box): Point => (isBox(end) ? { x: end.x + end.w / 2, y: end.y + end.h / 2 } : end);

/** Where a connector meets a box: the middle of the side that faces the other end, and that side's outward direction. */
function attach(end: Point | Box, toward: Point): { at: Point; out: Point } {
	if (!isBox(end)) {
		const dx = toward.x - end.x;
		const dy = toward.y - end.y;
		return { at: end, out: Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 } };
	}
	const c = centre(end);
	const dx = (toward.x - c.x) / end.w;
	const dy = (toward.y - c.y) / end.h;
	if (Math.abs(dx) >= Math.abs(dy)) {
		const side = dx >= 0 ? 1 : -1;
		return { at: { x: c.x + (side * end.w) / 2, y: c.y }, out: { x: side, y: 0 } };
	}
	const side = dy >= 0 ? 1 : -1;
	return { at: { x: c.x, y: c.y + (side * end.h) / 2 }, out: { x: 0, y: side } };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** A connector as a smooth curve leaving and entering square to the boxes' sides. */
export function connectorPath({ from, to }: Connector): string {
	const a = attach(from, centre(to));
	const b = attach(to, centre(from));
	const reach = Math.max(24, Math.hypot(b.at.x - a.at.x, b.at.y - a.at.y) * 0.45);
	const c1 = { x: a.at.x + a.out.x * reach, y: a.at.y + a.out.y * reach };
	const c2 = { x: b.at.x + b.out.x * reach, y: b.at.y + b.out.y * reach };
	return `M${round(a.at.x)} ${round(a.at.y)}C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(b.at.x)} ${round(b.at.y)}`;
}

/** The picture as an SVG document, or null when the table has nothing on it. */
export function tableWireframe(document: unknown): string | null {
	const { boxes, connectors } = tableLayout(document);
	if (!boxes.length && !connectors.length) return null;
	const points = [...boxes.flatMap((b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]), ...connectors.flatMap((c) => [c.from, c.to].filter((end) => !isBox(end)) as Point[])];
	const minX = Math.min(...points.map((p) => p.x));
	const minY = Math.min(...points.map((p) => p.y));
	const maxX = Math.max(...points.map((p) => p.x));
	const maxY = Math.max(...points.map((p) => p.y));
	// Line widths and corners stay the same on screen, whatever the table's size: the card is ~300px wide.
	const unit = Math.max(maxX - minX, (maxY - minY) * (4 / 3), 400) / 300;
	const pad = 12 * unit;
	const view = [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad].map(round).join(' ');
	const rect = (b: Box) =>
		`<rect x="${round(b.x)}" y="${round(b.y)}" width="${round(b.w)}" height="${round(b.h)}" rx="${round(5 * unit)}" ${b.frame ? `fill="none" stroke="rgba(255,255,255,0.22)" stroke-dasharray="${round(4 * unit)} ${round(3 * unit)}"` : 'fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.2)"'} stroke-width="${round(unit)}"/>`;
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" preserveAspectRatio="xMidYMid meet">`,
		...boxes.filter((b) => b.frame).map(rect),
		`<g fill="none" stroke="rgba(255,255,255,0.72)" stroke-width="${round(2.5 * unit)}" stroke-linecap="round">${connectors.map((c) => `<path d="${connectorPath(c)}"/>`).join('')}</g>`,
		...boxes.filter((b) => !b.frame).map(rect),
		'</svg>'
	].join('');
}
