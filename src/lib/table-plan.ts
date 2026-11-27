/**
 * A picture of a table drawn from its saved document, for when no canvas is open to draw the
 * real one: cards as boxes with their words, arrows as the curves they take with their labels,
 * each card numbered as `table_look` numbers them, overlaps outlined in red. An SVG, so it can be
 * shown as it is or turned into a JPEG (`server/table-picture.ts`).
 */
import type { TablePlan } from './table-document';

const FILL: Record<string, string> = { white: '#3a3a40', grey: '#4a4a52', black: '#1d1d21', 'light-violet': '#5b4a8a', violet: '#4b3a8a', blue: '#2f4f9a', 'light-blue': '#2f6a8f', yellow: '#8a6d1a', orange: '#96511f', green: '#2e6b3f', 'light-green': '#3f7a45', 'light-red': '#8f4a4a', red: '#8f2f2f' };
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrap(text: string, width: number, glyph: number, most: number): string[] {
	const fits = Math.max(4, Math.floor(width / glyph));
	const lines: string[] = [];
	for (const paragraph of text.split('\n')) {
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			if (line && line.length + 1 + word.length > fits) { lines.push(line); line = ''; }
			line += (line ? ' ' : '') + word;
		}
		lines.push(line);
	}
	return lines.length > most ? [...lines.slice(0, most - 1), `${lines[most - 1].slice(0, fits - 1)}…`] : lines;
}

export interface TablePicture { svg: string; width: number; height: number }

/** The plan as an SVG at most `maxSide` on its long side. */
export function tablePlanSvg(plan: TablePlan, maxSide = 1600): TablePicture | undefined {
	if (!plan.cards.length) return undefined;
	const pad = 60;
	// Room for arrows that curve out past the cards: the top of each one's bend.
	const tops = plan.lines.map(({ a, b, bend }) => { const length = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * bend, y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * bend }; });
	const minX = Math.min(...plan.cards.map((card) => card.x), ...tops.map((top) => top.x - 90)) - pad, minY = Math.min(...plan.cards.map((card) => card.y), ...tops.map((top) => top.y - 20)) - pad;
	const w = Math.max(...plan.cards.map((card) => card.x + card.w), ...tops.map((top) => top.x + 90)) + pad - minX, h = Math.max(...plan.cards.map((card) => card.y + card.h), ...tops.map((top) => top.y + 20)) + pad - minY;
	const scale = Math.min(1.5, maxSide / Math.max(w, h));
	const overlapping = new Set(plan.issues.overlaps.flatMap((overlap) => overlap.ids));
	const parts: string[] = [];
	const frames = plan.cards.filter((card) => card.type === 'frame' || card.type === 'group'), cards = plan.cards.filter((card) => card.type !== 'frame' && card.type !== 'group');
	for (const frame of frames) {
		parts.push(`<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="#232327" stroke="#77777f" stroke-width="2"/>`);
		if (frame.text) parts.push(`<text x="${frame.x}" y="${frame.y - 10}" font-size="20" fill="#c9c9cf">${escape(frame.text.slice(0, 80))}</text>`);
	}
	const labels: string[] = [];
	for (const line of plan.lines) {
		const { a, b } = line;
		const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		const control = { x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * line.bend * 2, y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * line.bend * 2 };
		const at = (t: number) => ({ x: (1 - t) ** 2 * a.x + 2 * t * (1 - t) * control.x + t ** 2 * b.x, y: (1 - t) ** 2 * a.y + 2 * t * (1 - t) * control.y + t ** 2 * b.y });
		const inside = (point: { x: number; y: number }, box: { x: number; y: number; w: number; h: number }) => point.x > box.x && point.x < box.x + box.w && point.y > box.y && point.y < box.y + box.h;
		let leaves = 0, arrives = 1;
		while (leaves < 0.45 && inside(at(leaves), line.from)) leaves += 0.01;
		while (arrives > 0.55 && inside(at(arrives), line.to)) arrives -= 0.01;
		const points = Array.from({ length: 25 }, (_, index) => at(leaves + ((arrives - leaves) * index) / 24));
		const stroke = line.color === 'red' || line.color === 'light-red' ? '#ff6b6b' : line.color === 'grey' ? '#8a8a92' : '#e8e8ee';
		const dash = line.dash === 'dashed' ? ' stroke-dasharray="12 8"' : line.dash === 'dotted' ? ' stroke-dasharray="3 7"' : '';
		parts.push(`<path d="M${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L')}" fill="none" stroke="${stroke}" stroke-width="3"${dash} marker-end="url(#head)"${line.both ? ' marker-start="url(#head)"' : ''}/>`);
		if (line.label.trim()) {
			const point = at(leaves + (arrives - leaves) * line.labelPosition);
			const words = wrap(line.label.trim(), 180, 10, 3);
			const width = Math.max(...words.map((one) => one.length)) * 10 + 16, height = words.length * 24 + 8;
			labels.push(`<rect x="${(point.x - width / 2).toFixed(1)}" y="${(point.y - height / 2).toFixed(1)}" width="${width}" height="${height}" rx="6" fill="#2b2b2f"/>` + words.map((one, index) => `<text x="${point.x.toFixed(1)}" y="${(point.y - height / 2 + 24 + index * 24).toFixed(1)}" font-size="18" text-anchor="middle" fill="#e8e8ee">${escape(one)}</text>`).join(''));
		}
	}
	for (const card of cards) {
		const text = card.type === 'text', red = overlapping.has(card.id);
		parts.push(`<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="${text ? 4 : 10}" fill="${text && (!card.color || card.color === 'white') ? '#2b2b2f' : FILL[card.color] ?? '#3a3a40'}" stroke="${red ? '#ff3b30' : text ? '#5a5a62' : '#8a8a92'}" stroke-width="${red ? 4 : 1.5}"/>`);
		const font = text ? card.font : 18, glyph = font * 0.54, line = font * 1.35;
		const words = wrap(card.text || card.kind, card.w - (text ? 0 : 20), glyph, Math.max(1, Math.floor((card.h - (text ? 0 : 16)) / line)));
		words.forEach((one, index) => parts.push(`<text x="${card.x + (text ? 2 : 10)}" y="${(card.y + (text ? 0 : 8) + (index + 0.8) * line).toFixed(1)}" font-size="${font}" fill="#f4f4f6"${index === 0 && !text ? ' font-weight="bold"' : ''}>${escape(one)}</text>`));
	}
	parts.push(...labels);
	const radius = Math.max(14, 13 / scale);
	for (const card of plan.cards) parts.push(`<circle cx="${card.x}" cy="${card.y}" r="${radius}" fill="${overlapping.has(card.id) ? '#ff3b30' : '#ffd60a'}"/><text x="${card.x}" y="${card.y + radius * 0.38}" font-size="${radius * 1.1}" font-weight="bold" text-anchor="middle" fill="#000">${card.n}</text>`);
	const width = Math.round(w * scale), height = Math.round(h * scale);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${w} ${h}" font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"><defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker></defs><rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#2b2b2f"/>${parts.join('')}</svg>`;
	return { svg, width, height };
}
