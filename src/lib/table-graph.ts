/**
 * A network of cards set out so its lines can be read: the layout behind `table_map` and the
 * `force` arrangement. Springs pull joined cards together (strong ties hard, weak ones lightly),
 * every card pushes the rest away, and a gentle pull to the middle keeps loose cards and small
 * islands from drifting off. Run from several seeded starts, the clearest is kept (fewest lines
 * crossing each other or passing through cards), then anything still touching is pushed apart by
 * its real rectangle. Pure and deterministic, with nothing but d3-force behind it, so the Worker
 * computes a map's positions before a single card is drawn.
 */
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { GRID, onGrid, segmentHitsBox, tidyLayout, upToGrid, type Box } from './table-layout';

/** A tie between two cards. `weight` 1 is a real link (the backbone); below 1 is a likeness, which pulls less and counts less. */
export interface GraphEdge { from: string; to: string; weight?: number }

export interface GraphOptions {
	/** Clear space kept around every card. */
	gap?: number;
	/** Extra length on every spring: more air between joined cards. */
	spread?: number;
	/** How many starts to try; the clearest wins. */
	seeds?: number;
	/** Start the first try from where the cards are now, so a table that already has a shape keeps it. */
	keep?: boolean;
}

export interface GraphResult {
	/** Each card's top-left, on the dot grid, the whole set starting at 0,0. */
	spots: Map<string, { x: number; y: number }>;
	/** What was wrong with the layout kept: lower is clearer. */
	score: number;
	seed: number;
	crossings: number;
	through: number;
}

type Point = { x: number; y: number };
/**
 * The forces, tuned on a real week of saves (71 cards, one hub of nineteen): how hard cards push each
 * other away for their size, how much harder a hub pushes (so only its own neighbours stand round
 * it), how far that push carries in card widths (short, so islands settle apart with air between), and gravity.
 */
const CHARGE = 14, HUB = 0.5, REACH = 4, GRAVITY = 0.02;
const floorGrid = (value: number) => Math.floor(value / GRID + 1e-6) * GRID;
const centre = (box: Box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

/** A small seeded generator (mulberry32): the same seed gives the same layout everywhere. */
export function seeded(seed: number): () => number {
	let state = (seed + 0x9e3779b9) >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Pushes apart whatever is closer than `gap`, moving each pair the least it can (along the
 * axis they overlap less on), a few passes over; anything still stuck is pushed down. The
 * last word on every layout: after it, nothing overlaps.
 */
export function separate(boxes: Box[], gap = GRID): Box[] {
	const out = boxes.map((box) => ({ ...box }));
	const close = (a: Box, b: Box) => ({ dx: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + gap, dy: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + gap });
	let clear = false;
	for (let pass = 0; pass < 80 && !clear; pass++) {
		clear = true;
		for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
			const a = out[i], b = out[j];
			const { dx, dy } = close(a, b);
			if (dx <= 0 || dy <= 0) continue;
			clear = false;
			const along = dx <= dy ? 'x' : 'y', by = upToGrid(Math.min(dx, dy));
			const first = centre(a)[along] <= centre(b)[along] ? a : b, second = first === a ? b : a;
			const half = floorGrid(by / 2);
			first[along] -= half;
			second[along] += by - half;
		}
	}
	if (!clear) for (const move of tidyLayout(out, gap)) Object.assign(out.find((box) => box.id === move.id)!, { x: move.x, y: move.y });
	return out;
}

const crosses = (a: Point, b: Point, c: Point, d: Point) => {
	const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
	const one = side(a, b, c), two = side(a, b, d), three = side(c, d, a), four = side(c, d, b);
	return ((one > 0 && two < 0) || (one < 0 && two > 0)) && ((three > 0 && four < 0) || (three < 0 && four > 0));
};

/** How hard a drawing is to read: lines crossing, lines running through cards they don't join, long lines, and a shape far from a screen's. */
export function graphScore(boxes: Box[], edges: GraphEdge[]): { score: number; crossings: number; through: number } {
	const at = new Map(boxes.map((box) => [box.id, centre(box)]));
	const lines = edges.filter((edge) => at.has(edge.from) && at.has(edge.to)).map((edge) => ({ ...edge, a: at.get(edge.from)!, b: at.get(edge.to)!, weight: edge.weight ?? 1 }));
	let crossings = 0, through = 0, cost = 0;
	for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
		const one = lines[i], two = lines[j];
		if (one.from === two.from || one.from === two.to || one.to === two.from || one.to === two.to) continue;
		if (crosses(one.a, one.b, two.a, two.b)) { crossings++; cost += one.weight + two.weight; }
	}
	for (const line of lines) for (const box of boxes) {
		if (box.id === line.from || box.id === line.to) continue;
		if (segmentHitsBox(line.a, line.b, box)) { through++; cost += 1 + line.weight; }
	}
	const size = Math.max(1, boxes.reduce((sum, box) => sum + Math.hypot(box.w, box.h), 0) / Math.max(1, boxes.length));
	const length = lines.reduce((sum, line) => sum + line.weight * Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y), 0) / size;
	const left = Math.min(...boxes.map((box) => box.x)), top = Math.min(...boxes.map((box) => box.y));
	const width = Math.max(...boxes.map((box) => box.x + box.w)) - left, height = Math.max(...boxes.map((box) => box.y + box.h)) - top;
	const shape = Math.abs(Math.log(Math.max(1, width) / Math.max(1, height) / 1.3));
	return { score: cost * 3 + length * 0.25 + shape * boxes.length * 0.5, crossings, through };
}

/** One settled run from one start. */
function settle(boxes: Box[], edges: GraphEdge[], seed: number, gap: number, spread: number, keep: boolean): Box[] {
	type Node = SimulationNodeDatum & { id: string; w: number; h: number; x: number; y: number };
	const random = seeded(seed);
	const mean = boxes.reduce((sum, box) => sum + Math.max(box.w, box.h), 0) / boxes.length;
	// A sunflower of starting places, dealt in a shuffled order: every seed is a different, evenly spread start.
	const order = boxes.map((_, index) => index);
	for (let index = order.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [order[index], order[swap]] = [order[swap], order[index]]; }
	const home = centre({ id: '', x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)), w: 0, h: 0 });
	const nodes: Node[] = boxes.map((box, index) => {
		if (keep) { const at = centre(box); return { id: box.id, w: box.w, h: box.h, x: at.x - home.x, y: at.y - home.y }; }
		const turn = order[index], radius = mean * 0.9 * Math.sqrt(turn + 0.5), angle = turn * Math.PI * (3 - Math.sqrt(5));
		return { id: box.id, w: box.w, h: box.h, x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
	});
	if (keep) { const cx = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length, cy = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length; for (const node of nodes) { node.x -= cx; node.y -= cy; } }
	const reach = (node: Node) => Math.hypot(node.w, node.h) / 2;
	const degree = new Map<string, number>();
	for (const edge of edges) { degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1); degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1); }
	// Cards are rectangles: two may sit closer side by side than corner to corner, so they collide as boxes.
	const collide = (alpha: number) => {
		for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
			const a = nodes[i], b = nodes[j];
			const dx = (a.w + b.w) / 2 + gap - Math.abs(b.x - a.x), dy = (a.h + b.h) / 2 + gap - Math.abs(b.y - a.y);
			if (dx <= 0 || dy <= 0) continue;
			const strength = Math.max(0.4, alpha);
			if (dx < dy) { const push = (dx / 2) * strength * (b.x >= a.x ? 1 : -1); a.x -= push; b.x += push; }
			else { const push = (dy / 2) * strength * (b.y >= a.y ? 1 : -1); a.y -= push; b.y += push; }
		}
	};
	type Link = { source: string | Node; target: string | Node; weight: number };
	const links: Link[] = edges.map((edge) => ({ source: edge.from, target: edge.to, weight: edge.weight ?? 1 }));
	const ends = (link: Link) => [link.source as Node, link.target as Node];
	const most = (link: Link) => Math.max(...ends(link).map((node) => degree.get(node.id) ?? 1)), least = (link: Link) => Math.min(...ends(link).map((node) => degree.get(node.id) ?? 1));
	// Where the springs want joined cards: a short step apart, or, round a hub, far enough out that all its neighbours fit in a ring.
	const ring = (count: number) => (count * (mean + gap)) / (2 * Math.PI);
	const length = (link: Link) => Math.max(ends(link).reduce((sum, node) => sum + reach(node), 0) * 0.8 + spread * (link.weight >= 1 ? 0.4 : 1.2), most(link) > 5 ? ring(most(link)) : 0);
	let packing = false;
	const simulation = forceSimulation(nodes)
		.randomSource(random)
		.force('link', forceLink<Node, Link>(links).id((node) => node.id).distance(length)
			.strength((link) => (link.weight >= 1 ? 0.9 : 0.35 * link.weight) / Math.sqrt(Math.max(1, least(link)))))
		.force('charge', forceManyBody<Node>().strength((node) => -(CHARGE * Math.hypot(node.w, node.h)) * (1 + HUB * Math.max(0, (degree.get(node.id) ?? 0) - 2))).distanceMax(mean * REACH))
		// Gravity: the pull to the middle that a hub joined to everything would give, without drawing it.
		.force('x', forceX<Node>(0).strength(GRAVITY))
		.force('y', forceY<Node>(0).strength(GRAVITY * 1.25))
		.force('collide', (alpha: number) => { if (packing) collide(alpha); })
		.stop();
	// The shape first, cards as points; then the cards take up their room.
	for (let tick = 0; tick < 380; tick++) { packing = tick > 160; simulation.tick(); }
	const placed = nodes.map((node) => ({ id: node.id, x: onGrid(node.x - node.w / 2), y: onGrid(node.y - node.h / 2), w: node.w, h: node.h }));
	return separate(placed, gap);
}

/** Sets out cards and their ties as a network. With no ties at all it is still a tidy cloud, held together by gravity. */
export function graphLayout(boxes: Box[], edges: GraphEdge[], options: GraphOptions = {}): GraphResult {
	if (!boxes.length) return { spots: new Map(), score: 0, seed: 0, crossings: 0, through: 0 };
	const ids = new Set(boxes.map((box) => box.id));
	const seen = new Set<string>();
	const within = edges.filter((edge) => {
		const key = edge.from < edge.to ? `${edge.from} ${edge.to}` : `${edge.to} ${edge.from}`;
		return ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to && !seen.has(key) && !!seen.add(key);
	});
	const sized = boxes.map((box) => ({ ...box, w: upToGrid(box.w), h: upToGrid(box.h) }));
	const gap = Math.max(GRID, options.gap ?? GRID * 2);
	const spread = options.spread ?? gap * 3;
	// Big graphs cost more a try and gain less from each: fewer starts.
	const tries = Math.max(1, Math.min(options.seeds ?? 12, sized.length > 160 ? 3 : sized.length > 90 ? 6 : 12));
	let best: (GraphResult & { boxes: Box[] }) | undefined;
	for (let seed = 0; seed < tries; seed++) {
		const placed = settle(sized, within, seed, gap, spread, !!options.keep && seed === 0);
		const scored = graphScore(placed, within);
		if (!best || scored.score < best.score - 1e-9) best = { ...scored, seed, boxes: placed, spots: new Map() };
	}
	const left = Math.min(...best!.boxes.map((box) => box.x)), top = Math.min(...best!.boxes.map((box) => box.y));
	return { spots: new Map(best!.boxes.map((box) => [box.id, { x: box.x - left, y: box.y - top }])), score: best!.score, seed: best!.seed, crossings: best!.crossings, through: best!.through };
}
