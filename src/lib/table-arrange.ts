/**
 * Setting out a table (or a selection, or what a frame holds) in one step: the layouts behind
 * the assistant's `table_arrange`. Every layout works from the items' measured boxes and, for
 * the graph layouts, the arrows tied to them, and answers with where each item's top-left
 * goes. Pure and deterministic (the same table always comes out the same way), so the canvas,
 * the chat replays and the tests share it. Nothing it returns overlaps: positions land on the
 * dot grid and a last pass (`separate`) pushes apart anything a layout left too close.
 *
 * Where each layout comes from is written up in docs/tables/layout-research.md.
 */
import dagre from '@dagrejs/dagre';
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { TABLE_ARRANGEMENTS, type TableArrangement, type TableCluster, type TableDirection } from './table-agent';
import { GRID, columnLayout, columnsLayout, gridLayout, onGrid, rowLayout, tidyLayout, upToGrid, type Box, type Placement } from './table-layout';

/** An arrow tied to two items: `from` points at `to`. */
export interface Edge { from: string; to: string }
export type Direction = TableDirection;
export type Arrangement = TableArrangement;
export const ARRANGEMENTS = TABLE_ARRANGEMENTS;
const GRAPH = new Set<Arrangement>(['tree', 'mindmap', 'radial', 'layered', 'force']);
export const usesArrows = (mode: Arrangement) => GRAPH.has(mode);

export type Cluster = TableCluster;

export interface ArrangeRequest {
	mode: Arrangement;
	boxes: Box[];
	edges?: Edge[];
	/** The set's new top-left; where it is now if left out. */
	at?: { x: number; y: number };
	/** Space between neighbours (a grid step if left out); ranks and branches sit four of these apart. */
	gap?: number;
	columns?: number;
	/** Which way a tree or flow grows. */
	direction?: Direction;
	/** The item a tree, mind map or radial layout starts from. */
	root?: string;
	/** Row, column, grid and columns in the order the boxes are given, not the order they read in now. */
	ordered?: boolean;
	/** For `cluster`: the groups, in order. Items in none go last, together. */
	groups?: Cluster[];
	/** Space between clusters. */
	clusterGap?: number;
}

export interface ArrangeResult {
	/** The layout used: what `auto` chose, or what a graph layout fell back to with no arrows. */
	mode: Exclude<Arrangement, 'auto'>;
	placements: Placement[];
	/** For `cluster`: the groups as set out, each with its items. */
	groups?: Cluster[];
	note?: string;
}

type Point = { x: number; y: number };
type Size = { w: number; h: number };
const floorGrid = (value: number) => Math.floor(value / GRID + 1e-6) * GRID;
const centre = (box: Box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

/* Graph helpers */

/** The arrows that join two different items of the set, once per pair and direction. */
function edgesWithin(boxes: Box[], edges: Edge[] = []): Edge[] {
	const ids = new Set(boxes.map((box) => box.id));
	const seen = new Set<string>();
	return edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to && !seen.has(`${edge.from}>${edge.to}`) && !!seen.add(`${edge.from}>${edge.to}`));
}

function neighbours(ids: string[], edges: Edge[]) {
	const out = new Map<string, string[]>(ids.map((id) => [id, []])), into = new Map<string, string[]>(ids.map((id) => [id, []])), both = new Map<string, string[]>(ids.map((id) => [id, []]));
	for (const { from, to } of edges) {
		out.get(from)!.push(to);
		into.get(to)!.push(from);
		both.get(from)!.push(to);
		both.get(to)!.push(from);
	}
	return { out, into, both };
}

/** The sets of items joined to each other by arrows, biggest first; an item joined to nothing is a set of one. */
export function components(ids: string[], edges: Edge[]): string[][] {
	const { both } = neighbours(ids, edges);
	const seen = new Set<string>();
	const sets: string[][] = [];
	for (const id of ids) {
		if (seen.has(id)) continue;
		const set: string[] = [];
		const queue = [id];
		seen.add(id);
		while (queue.length) {
			const next = queue.shift()!;
			set.push(next);
			for (const other of both.get(next)!) if (!seen.has(other)) { seen.add(other); queue.push(other); }
		}
		sets.push(set);
	}
	return sets.map((set, index) => ({ set, index })).sort((a, b) => b.set.length - a.set.length || a.index - b.index).map(({ set }) => set);
}

/** Whether the arrows make a forest: no item pointed at twice, and no loops. */
export function isForest(ids: string[], edges: Edge[]): boolean {
	const { into } = neighbours(ids, edges);
	if ([...into.values()].some((from) => from.length > 1)) return false;
	// With at most one parent each, a loop is a set with as many arrows as items.
	return components(ids, edges).every((set) => edges.filter((edge) => set.includes(edge.from)).length === set.length - 1);
}

interface Tree { roots: string[]; kids: Map<string, string[]> }

/**
 * A tree over joined items, breadth first so each sits as near the root as it can. `directed`
 * follows arrows from the items nothing points at (an org chart); otherwise arrows count both
 * ways from the best-connected item (a mind map). `rank` orders siblings: by where they are now.
 */
function spanning(ids: string[], edges: Edge[], rank: Map<string, number>, { root, directed }: { root?: string; directed: boolean }): Tree {
	const { out, into, both } = neighbours(ids, edges);
	const byRank = (a: string, b: string) => rank.get(a)! - rank.get(b)!;
	const kids = new Map<string, string[]>(ids.map((id) => [id, []]));
	const seen = new Set<string>();
	const grow = (from: string[], next: Map<string, string[]>) => {
		const queue = [...from];
		while (queue.length) {
			const id = queue.shift()!;
			for (const other of next.get(id)!.toSorted(byRank)) {
				if (seen.has(other)) continue;
				seen.add(other);
				kids.get(id)!.push(other);
				queue.push(other);
			}
		}
	};
	const roots: string[] = [];
	const start = (id: string) => { roots.push(id); seen.add(id); };
	if (root && ids.includes(root)) start(root);
	if (directed) for (const id of ids.toSorted(byRank)) if (!seen.has(id) && !into.get(id)!.length) start(id);
	grow(roots, directed ? out : both);
	grow([...seen], both);
	for (;;) {
		const left = ids.filter((id) => !seen.has(id));
		if (!left.length) break;
		// A loop with no way in, or another set: start at its best-connected item.
		const best = left.sort((a, b) => both.get(b)!.length - both.get(a)!.length || byRank(a, b))[0];
		start(best);
		grow([best], directed ? out : both);
		grow([...seen], both);
	}
	return { roots, kids };
}

/* The layouts. Each answers with top-lefts relative to its own corner. */

/**
 * A tidy tree for cards of any size: each depth is a band as deep as its deepest card, each
 * subtree as broad as its children side by side (or its own card, if broader), a parent
 * centred over its children. Subtrees never share room, so nothing overlaps.
 */
function forestLayout(tree: Tree, sizes: Map<string, Size>, direction: Direction, gap: number, rankGap: number, rootGap = gap * 2): Map<string, Point> {
	const sideways = direction === 'right' || direction === 'left';
	const breadth = (id: string) => (sideways ? sizes.get(id)!.h : sizes.get(id)!.w);
	const depthOf = (id: string) => (sideways ? sizes.get(id)!.w : sizes.get(id)!.h);
	const bands: number[] = [];
	const span = new Map<string, number>();
	const measure = (id: string, depth: number): number => {
		bands[depth] = Math.max(bands[depth] ?? 0, depthOf(id));
		const below = tree.kids.get(id)!;
		const across = below.reduce((sum, kid) => sum + measure(kid, depth + 1), 0) + gap * Math.max(0, below.length - 1);
		span.set(id, Math.max(breadth(id), across));
		return span.get(id)!;
	};
	tree.roots.forEach((root) => measure(root, 0));
	const bandStart = bands.map((_, depth) => bands.slice(0, depth).reduce((sum, band) => sum + band + rankGap, 0));
	const spots = new Map<string, Point>();
	const put = (id: string, start: number, depth: number) => {
		const across = start + floorGrid((span.get(id)! - breadth(id)) / 2);
		const mirrored = direction === 'up' || direction === 'left';
		const along = mirrored ? -(bandStart[depth] + depthOf(id)) : bandStart[depth];
		spots.set(id, sideways ? { x: along, y: across } : { x: across, y: along });
		const below = tree.kids.get(id)!;
		const total = below.reduce((sum, kid) => sum + span.get(kid)!, 0) + gap * Math.max(0, below.length - 1);
		let next = start + floorGrid((span.get(id)! - total) / 2);
		for (const kid of below) { put(kid, next, depth + 1); next += span.get(kid)! + gap; }
	};
	let start = 0;
	for (const root of tree.roots) { put(root, start, 0); start += span.get(root)! + rootGap; }
	return spots;
}

const extent = (spots: Map<string, Point>, sizes: Map<string, Size>) => {
	const all = [...spots].map(([id, spot]) => ({ ...spot, ...sizes.get(id)! }));
	if (!all.length) return { x: 0, y: 0, w: 0, h: 0 };
	const x = Math.min(...all.map((one) => one.x)), y = Math.min(...all.map((one) => one.y));
	return { x, y, w: Math.max(...all.map((one) => one.x + one.w)) - x, h: Math.max(...all.map((one) => one.y + one.h)) - y };
};

/** A mind map: the root in the middle, its branches shared between right and left, each side a tree growing outward. */
function mindmapLayout(tree: Tree, sizes: Map<string, Size>, now: Map<string, Point>, gap: number, rankGap: number): Map<string, Point> {
	const spots = new Map<string, Point>();
	let top = 0;
	for (const root of tree.roots) {
		const size = sizes.get(root)!;
		// Branches already right of the root stay right, when that leaves the sides even enough.
		const branches = tree.kids.get(root)!.toSorted((a, b) => Number(now.get(a)!.x < now.get(root)!.x) - Number(now.get(b)!.x < now.get(root)!.x));
		const weight = (id: string): number => Math.max(sizes.get(id)!.h, tree.kids.get(id)!.reduce((sum, kid) => sum + weight(kid) + gap, -gap));
		const total = branches.reduce((sum, id) => sum + weight(id), 0);
		const right: string[] = [], left: string[] = [];
		let taken = 0;
		for (const id of branches) { (taken < total / 2 ? right : left).push(id); taken += weight(id); }
		const byHeight = (a: string, b: string) => now.get(a)!.y - now.get(b)!.y;
		const sides = [
			{ spots: forestLayout({ roots: right.sort(byHeight), kids: tree.kids }, sizes, 'right', gap, rankGap, gap), x: size.w + rankGap },
			{ spots: forestLayout({ roots: left.sort(byHeight), kids: tree.kids }, sizes, 'left', gap, rankGap, gap), x: -rankGap }
		];
		const boxes = sides.map((side) => extent(side.spots, sizes));
		const height = Math.max(size.h, ...boxes.map((box) => box.h));
		spots.set(root, { x: 0, y: top + floorGrid((height - size.h) / 2) });
		sides.forEach((side, index) => {
			const dy = top + floorGrid((height - boxes[index].h) / 2) - boxes[index].y;
			for (const [id, spot] of side.spots) spots.set(id, { x: spot.x + side.x, y: spot.y + dy });
		});
		top += height + rankGap;
	}
	return spots;
}

/**
 * A radial tree: the root in the middle, each depth a ring, each subtree a wedge as wide as
 * its share of the leaves. A ring is as big as its tightest wedge needs for its card.
 */
function radialLayout(tree: Tree, sizes: Map<string, Size>, gap: number, rankGap: number): Map<string, Point> {
	const spots = new Map<string, Point>();
	let left = 0;
	for (const root of tree.roots) {
		const leaves = new Map<string, number>();
		const count = (id: string): number => { const kids = tree.kids.get(id)!; const total = kids.length ? kids.reduce((sum, kid) => sum + count(kid), 0) : 1; leaves.set(id, total); return total; };
		count(root);
		const rings: { id: string; angle: number; wedge: number }[][] = [];
		const fan = (id: string, from: number, wedge: number, depth: number) => {
			(rings[depth] ??= []).push({ id, angle: from + wedge / 2, wedge });
			let at = from;
			for (const kid of tree.kids.get(id)!) { const share = (wedge * leaves.get(kid)!) / leaves.get(id)!; fan(kid, at, share, depth + 1); at += share; }
		};
		fan(root, 0, Math.PI * 2, 0);
		const across = (id: string) => Math.hypot(sizes.get(id)!.w, sizes.get(id)!.h);
		const centres = new Map<string, Point>();
		let radius = 0, last = 0;
		rings.forEach((ring, depth) => {
			const widest = Math.max(...ring.map((one) => across(one.id)));
			if (depth) {
				const fits = Math.max(...ring.map((one) => (across(one.id) + gap) / (2 * Math.sin(Math.min(one.wedge, Math.PI) / 2))));
				radius = Math.max(radius + last / 2 + widest / 2 + rankGap / 2, ring.length > 1 ? fits : 0);
			}
			last = widest;
			for (const one of ring) centres.set(one.id, { x: radius * Math.cos(one.angle - Math.PI / 2), y: radius * Math.sin(one.angle - Math.PI / 2) });
		});
		const block = new Map([...centres].map(([id, point]) => [id, { x: onGrid(point.x - sizes.get(id)!.w / 2), y: onGrid(point.y - sizes.get(id)!.h / 2) }]));
		const box = extent(block, sizes);
		for (const [id, spot] of block) spots.set(id, { x: spot.x - box.x + left, y: spot.y - box.y });
		left += box.w + rankGap;
	}
	return spots;
}

/**
 * A layered (Sugiyama) drawing by dagre: loops broken, items ranked so arrows point one way,
 * each rank ordered to cross as few arrows as it can, then spaced. For flows where arrows
 * merge, skip ranks or loop, which a tree can't show.
 */
function layeredLayout(boxes: Box[], edges: Edge[], sizes: Map<string, Size>, direction: Direction, gap: number, rankGap: number): Map<string, Point> {
	const graph = new dagre.graphlib.Graph({ multigraph: true });
	graph.setGraph({ rankdir: ({ down: 'TB', up: 'BT', right: 'LR', left: 'RL' } as const)[direction], nodesep: gap * 2, ranksep: rankGap, marginx: 0, marginy: 0 });
	graph.setDefaultEdgeLabel(() => ({}));
	for (const box of boxes) graph.setNode(box.id, { width: sizes.get(box.id)!.w, height: sizes.get(box.id)!.h });
	edges.forEach((edge, index) => graph.setEdge(edge.from, edge.to, {}, String(index)));
	dagre.layout(graph);
	return new Map(boxes.map((box) => { const node = graph.node(box.id) as { x: number; y: number }; return [box.id, { x: onGrid(node.x - sizes.get(box.id)!.w / 2), y: onGrid(node.y - sizes.get(box.id)!.h / 2) }]; }));
}

/**
 * Force-directed (d3-force, run to rest in one go): arrows are springs, every card pushes the
 * others away, cards can't share room, and each is held loosely to where it was, so the table
 * keeps its shape while joined things draw together.
 */
function forceLayout(boxes: Box[], edges: Edge[], sizes: Map<string, Size>, gap: number, rankGap: number): Map<string, Point> {
	type Node = SimulationNodeDatum & { id: string; w: number; h: number; x: number; y: number; homeX: number; homeY: number };
	const nodes: Node[] = boxes.map((box) => { const at = centre(box), size = sizes.get(box.id)!; return { id: box.id, ...size, x: at.x, y: at.y, homeX: at.x, homeY: at.y }; });
	const reach = (node: Node) => Math.max(node.w, node.h) / 2;
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
	const simulation = forceSimulation(nodes)
		.force('link', forceLink<Node, { source: string | Node; target: string | Node }>(edges.map((edge) => ({ source: edge.from, target: edge.to }))).id((node) => node.id).distance((link) => reach(link.source as Node) + reach(link.target as Node) + rankGap).strength(0.35))
		.force('charge', forceManyBody<Node>().strength(-2400).distanceMax(2400))
		.force('x', forceX<Node>((node) => node.homeX).strength(0.03))
		.force('y', forceY<Node>((node) => node.homeY).strength(0.03))
		.force('collide', collide)
		.stop();
	for (let tick = 0; tick < 300; tick++) simulation.tick();
	return new Map(nodes.map((node) => [node.id, { x: onGrid(node.x - node.w / 2), y: onGrid(node.y - node.h / 2) }]));
}

/** Shelf packing: blocks in rows, each row as tall as its tallest, wrapped at about the width that makes the whole 4:3. */
function shelves(blocks: Size[], gapX: number, gapY = gapX, width?: number): Point[] {
	if (!blocks.length) return [];
	const area = blocks.reduce((sum, block) => sum + (block.w + gapX) * (block.h + gapY), 0);
	const limit = width ?? Math.max(...blocks.map((block) => block.w), Math.sqrt((area * 4) / 3));
	let x = 0, y = 0, tallest = 0;
	return blocks.map((block) => {
		if (x && x + block.w > limit) { x = 0; y += tallest + gapY; tallest = 0; }
		const spot = { x, y };
		x += block.w + gapX;
		tallest = Math.max(tallest, block.h);
		return spot;
	});
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

/* Putting it together */

/** What `auto` settles on for these items and arrows. */
export function chooseArrangement(boxes: Box[], edges: Edge[] = []): Exclude<Arrangement, 'auto'> {
	const joined = edgesWithin(boxes, edges);
	if (joined.length) return isForest(boxes.map((box) => box.id), joined) ? 'tree' : 'layered';
	const heights = boxes.map((box) => box.h);
	return boxes.length > 3 && Math.max(...heights) > Math.min(...heights) * 1.25 ? 'columns' : 'grid';
}

const wide = (count: number) => Math.max(1, Math.ceil(Math.sqrt(count * 1.4)));

export function arrange(request: ArrangeRequest): ArrangeResult {
	const { boxes } = request;
	if (!boxes.length) return { mode: request.mode === 'auto' ? 'grid' : request.mode, placements: [] };
	const gap = Math.max(0, Math.min(200, Math.round((request.gap ?? GRID) / GRID) * GRID));
	const rankGap = Math.max(gap * 4, GRID * 2);
	const origin = { x: onGrid(request.at?.x ?? Math.min(...boxes.map((box) => box.x))), y: onGrid(request.at?.y ?? Math.min(...boxes.map((box) => box.y))) };
	const edges = edgesWithin(boxes, request.edges);
	let mode = request.mode === 'auto' ? chooseArrangement(boxes, edges) : request.mode;
	let note: string | undefined;
	if (GRAPH.has(mode) && !edges.length) {
		note = `Nothing here is joined by arrows, so there is no ${mode === 'layered' ? 'flow' : mode === 'force' ? 'graph' : mode} to draw: set out as ${chooseArrangement(boxes)} instead. Connect things first (table_connect), or use cluster with groups.`;
		mode = chooseArrangement(boxes);
	}
	if (mode === 'cluster' && !request.groups?.some((group) => group.ids.some((id) => boxes.some((box) => box.id === id)))) {
		note = 'No groups were given for cluster (name `groups`, or `by`), so this is a grid.';
		mode = 'grid';
	}
	const columns = Math.max(1, Math.min(boxes.length, request.columns ?? wide(boxes.length)));
	const done = (placements: Placement[], more: Partial<ArrangeResult> = {}): ArrangeResult => ({ mode: mode as ArrangeResult['mode'], placements, ...more, ...(note ? { note } : {}) });

	// The simple layouts keep reading order; told the order, each box is stood in a line first so that is the order they read in.
	const line = request.ordered ? boxes.map((box, index) => ({ ...box, x: index, y: 0 })) : boxes;
	if (mode === 'grid') return done(gridLayout(line, columns, origin, gap));
	if (mode === 'columns') return done(columnsLayout(line, columns, origin, gap));
	if (mode === 'row') return done(rowLayout(line, origin, gap));
	if (mode === 'column') return done(columnLayout(line, origin, gap));

	const sizes = new Map<string, Size>(boxes.map((box) => [box.id, { w: upToGrid(box.w), h: upToGrid(box.h) }]));
	const sized = (id: string) => sizes.get(id)!;
	/** Blocks of already-placed items, shelved side by side and moved to the origin. */
	const shelved = (blocks: Map<string, Point>[], gapX: number, gapY = gapX, top: Point = origin): Placement[] => {
		const frames = blocks.map((block) => extent(block, sizes));
		const spots = shelves(frames, gapX, gapY);
		return blocks.flatMap((block, index) => [...block].map(([id, spot]) => ({ id, x: top.x + spots[index].x + spot.x - frames[index].x, y: top.y + spots[index].y + spot.y - frames[index].y })));
	};

	if (mode === 'pack') {
		const sorted = boxes.toSorted((a, b) => upToGrid(b.h) - upToGrid(a.h) || upToGrid(b.w) - upToGrid(a.w) || a.y - b.y || a.x - b.x);
		return done(shelved(sorted.map((box) => new Map([[box.id, { x: 0, y: 0 }]])), gap));
	}

	if (mode === 'cluster') {
		const taken = new Set<string>();
		const byId = new Map(boxes.map((box) => [box.id, box]));
		const groups: Cluster[] = [];
		for (const group of request.groups ?? []) {
			const ids = [...new Set(group.ids)].filter((id) => byId.has(id) && !taken.has(id));
			ids.forEach((id) => taken.add(id));
			if (ids.length) groups.push({ ...(group.name ? { name: group.name } : {}), ids });
		}
		const rest = boxes.filter((box) => !taken.has(box.id)).map((box) => box.id);
		if (rest.length) groups.push({ ids: rest });
		const blocks = groups.map((group) => {
			// Each box starts at one corner, so a cluster reads in the order its ids were given.
			const members = group.ids.map((id) => ({ ...byId.get(id)!, x: 0, y: 0 }));
			return new Map(gridLayout(members, Math.min(members.length, request.columns ?? wide(members.length)), { x: 0, y: 0 }, gap).map((spot) => [spot.id, { x: spot.x, y: spot.y }]));
		});
		const between = request.clusterGap ?? 200;
		return done(shelved(blocks, between), { groups });
	}

	// The graph layouts: joined items by the layout, the rest in a grid underneath.
	const ids = boxes.map((box) => box.id);
	const degree = new Map<string, number>(ids.map((id) => [id, 0]));
	for (const edge of edges) { degree.set(edge.from, degree.get(edge.from)! + 1); degree.set(edge.to, degree.get(edge.to)! + 1); }
	const joined = boxes.filter((box) => degree.get(box.id)), loose = boxes.filter((box) => !degree.get(box.id));
	const direction = request.direction ?? 'down';
	const sideways = direction === 'right' || direction === 'left';
	const now = new Map(boxes.map((box) => [box.id, centre(box)]));
	const order = (axis: 'x' | 'y') => new Map(joined.toSorted((a, b) => centre(a)[axis] - centre(b)[axis] || centre(a)[axis === 'x' ? 'y' : 'x'] - centre(b)[axis === 'x' ? 'y' : 'x']).map((box, index) => [box.id, index]));
	let blocks: Map<string, Point>[];
	if (mode === 'layered') blocks = [layeredLayout(joined, edges, sizes, direction, gap, rankGap)];
	else if (mode === 'force') blocks = [forceLayout(joined, edges, sizes, gap, rankGap)];
	else {
		blocks = components(joined.map((box) => box.id), edges).map((set) => {
			const within = edges.filter((edge) => set.includes(edge.from));
			if (mode === 'tree') return forestLayout(spanning(set, within, order(sideways ? 'y' : 'x'), { root: request.root, directed: true }), sizes, direction, gap, rankGap);
			const tree = spanning(set, within, order('y'), { root: request.root, directed: false });
			return mode === 'mindmap' ? mindmapLayout(tree, sizes, now, gap, rankGap) : radialLayout(tree, sizes, gap * 2, rankGap);
		});
	}
	const main = shelved(blocks, rankGap);
	const drawn = main.map((spot) => ({ ...spot, ...sized(spot.id) }));
	const bottom = Math.max(...drawn.map((one) => one.y + one.h)), width = Math.max(...drawn.map((one) => one.x + one.w)) - origin.x;
	const average = loose.reduce((sum, box) => sum + upToGrid(box.w) + gap, 0) / Math.max(1, loose.length);
	const others = loose.length ? gridLayout(loose, Math.max(1, Math.min(loose.length, Math.max(wide(loose.length), Math.floor((width + gap) / average)))), { x: origin.x, y: bottom + rankGap }, gap) : [];
	// Rounding to the grid, a ring or a spring can leave two cards a hair too close: the last pass settles it.
	const settled = separate([...main, ...others].map((spot) => ({ ...spot, ...sized(spot.id) })), gap);
	const corner = { x: Math.min(...settled.map((box) => box.x)), y: Math.min(...settled.map((box) => box.y)) };
	return done(settled.map((box) => ({ id: box.id, x: box.x - corner.x + origin.x, y: box.y - corner.y + origin.y })), loose.length ? { note: note ?? `${loose.length} ${loose.length === 1 ? 'item isn’t' : 'items aren’t'} joined to anything by an arrow: set in a grid below.` } : {});
}

/** How an item is told from another when clustering without named groups. */
export interface Sortable { id: string; kind: string; color?: string }
const KIND_NAMES: Record<string, string> = { post: 'Posts', book: 'Books', wiki: 'Wiki', arena: 'Are.na', link: 'Links', quote: 'Quotes', image: 'Pictures', note: 'Notes', text: 'Text', frame: 'Frames', geo: 'Shapes' };

/** Groups for `cluster` when none are named: by kind of thing, by colour, or by what arrows join together. */
export function clustersBy(items: Sortable[], by: 'kind' | 'color' | 'connected', edges: Edge[] = []): Cluster[] {
	if (by === 'connected') return components(items.map((item) => item.id), edges.filter((edge) => items.some((item) => item.id === edge.from) && items.some((item) => item.id === edge.to))).filter((set) => set.length > 1).map((ids) => ({ ids }));
	const groups = new Map<string, string[]>();
	for (const item of items) {
		const key = by === 'color' ? item.color ?? 'none' : item.kind;
		groups.set(key, [...(groups.get(key) ?? []), item.id]);
	}
	return [...groups].map(([key, ids]) => ({ name: by === 'color' ? key.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) : KIND_NAMES[key] ?? key.replace(/^./, (letter) => letter.toUpperCase()), ids }));
}
