import { describe, expect, test } from 'bun:test';
import { ARRANGEMENTS, arrange, chooseArrangement, clustersBy, components, isForest, separate, type Edge } from '../src/lib/table-arrange';
import { arrowCrossings, layoutIssues, type Box, type Placement } from '../src/lib/table-layout';

const apply = (boxes: Box[], placements: Placement[]) => boxes.map((box) => ({ ...box, ...placements.find((place) => place.id === box.id) }));
const clean = (boxes: Box[]) => { const issues = layoutIssues(boxes); return !issues.overlaps.length && !issues.crowded.length; };
const centre = (box: Box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
const crossings = (boxes: Box[], edges: Edge[]) => arrowCrossings(edges.map((edge, index) => ({ id: `e${index}`, a: centre(boxes.find((box) => box.id === edge.from)!), b: centre(boxes.find((box) => box.id === edge.to)!), skip: [edge.from, edge.to] })), boxes);

/** A heap: cards of mixed sizes dropped on top of each other, as a table looks after a long chat. */
const heap = (count: number): Box[] => Array.from({ length: count }, (_, index) => ({
	id: `n${index}`, x: (index * 137) % 420, y: (index * 89) % 300,
	w: [240, 200, 180, 360][index % 4], h: [240, 200, 300, 140, 420][index % 5]
}));

// An org chart: a lead, three reports, and two under each of the first two.
const orgEdges: Edge[] = [['n0', 'n1'], ['n0', 'n2'], ['n0', 'n3'], ['n1', 'n4'], ['n1', 'n5'], ['n2', 'n6'], ['n2', 'n7']].map(([from, to]) => ({ from, to }));
// A flow that merges and loops back: not a tree.
const flowEdges: Edge[] = [['n0', 'n1'], ['n0', 'n2'], ['n1', 'n3'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n1'], ['n3', 'n5']].map(([from, to]) => ({ from, to }));

describe('table arrange', () => {
	test('every layout leaves a heap with no overlaps, on the grid, at the heap’s corner', () => {
		const boxes = heap(14);
		for (const mode of ARRANGEMENTS) {
			const result = arrange({ mode, boxes, edges: mode === 'layered' || mode === 'force' ? flowEdges : orgEdges, groups: [{ name: 'A', ids: ['n0', 'n1', 'n2', 'n3'] }, { name: 'B', ids: ['n4', 'n5', 'n6'] }] });
			const after = apply(boxes, result.placements);
			expect(result.placements.length, mode).toBe(boxes.length);
			expect(clean(after), mode).toBe(true);
			expect(after.every((box) => box.x % 20 === 0 && box.y % 20 === 0), mode).toBe(true);
			expect([Math.min(...after.map((box) => box.x)), Math.min(...after.map((box) => box.y))], mode).toEqual([0, 0]);
		}
	});

	test('the same table comes out the same way twice', () => {
		const boxes = heap(12);
		for (const mode of ['force', 'layered', 'radial', 'mindmap'] as const) expect(arrange({ mode, boxes, edges: flowEdges })).toEqual(arrange({ mode, boxes, edges: flowEdges }));
	});

	test('tree: parents sit over their children, siblings share a rank, and no arrow runs through a card', () => {
		const boxes = heap(8);
		const after = apply(boxes, arrange({ mode: 'tree', boxes, edges: orgEdges }).placements);
		const at = (id: string) => after.find((box) => box.id === id)!;
		for (const { from, to } of orgEdges) expect(at(from).y + at(from).h).toBeLessThan(at(to).y);
		expect(new Set(['n1', 'n2', 'n3'].map((id) => at(id).y)).size).toBe(1);
		const kids = ['n1', 'n2', 'n3'].map((id) => centre(at(id)).x);
		expect(centre(at('n0')).x).toBeGreaterThan(Math.min(...kids));
		expect(centre(at('n0')).x).toBeLessThan(Math.max(...kids));
		expect(crossings(after, orgEdges)).toEqual([]);
	});

	test('tree: grows right, left or up when asked, and from the root named', () => {
		const boxes = heap(8);
		const at = (after: Box[], id: string) => after.find((box) => box.id === id)!;
		const right = apply(boxes, arrange({ mode: 'tree', boxes, edges: orgEdges, direction: 'right' }).placements);
		for (const { from, to } of orgEdges) expect(at(right, from).x + at(right, from).w).toBeLessThan(at(right, to).x);
		const up = apply(boxes, arrange({ mode: 'tree', boxes, edges: orgEdges, direction: 'up' }).placements);
		for (const { from, to } of orgEdges) expect(at(up, to).y + at(up, to).h).toBeLessThan(at(up, from).y);
		// Rooted at a leaf, the arrows are followed backwards from it.
		const rooted = apply(boxes, arrange({ mode: 'tree', boxes, edges: orgEdges, root: 'n4' }).placements);
		expect(Math.min(...rooted.map((box) => box.y))).toBe(at(rooted, 'n4').y);
	});

	test('mind map: the best-connected card in the middle, branches on both sides', () => {
		const boxes = heap(8);
		const edges: Edge[] = [...['n1', 'n2', 'n3', 'n4'].map((to) => ({ from: 'n0', to })), { from: 'n1', to: 'n5' }, { from: 'n3', to: 'n6' }, { from: 'n7', to: 'n0' }];
		const after = apply(boxes, arrange({ mode: 'mindmap', boxes, edges }).placements);
		const root = after.find((box) => box.id === 'n0')!;
		const sides = after.filter((box) => box.id !== 'n0').map((box) => (box.x > root.x ? 'right' : 'left'));
		expect(sides).toContain('right');
		expect(sides).toContain('left');
		expect(after.filter((box) => box.id !== 'n0').every((box) => box.x + box.w < root.x || box.x > root.x + root.w)).toBe(true);
	});

	test('radial: the root in the middle of its ring', () => {
		const boxes = heap(7);
		const edges = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map((to) => ({ from: 'n0', to }));
		const after = apply(boxes, arrange({ mode: 'radial', boxes, edges }).placements);
		const root = centre(after.find((box) => box.id === 'n0')!);
		const others = after.filter((box) => box.id !== 'n0').map(centre);
		expect(others.some((point) => point.x < root.x) && others.some((point) => point.x > root.x) && others.some((point) => point.y < root.y) && others.some((point) => point.y > root.y)).toBe(true);
	});

	test('layered: a flow with a merge and a loop still ranks downstream cards lower', () => {
		const boxes = heap(6);
		const after = apply(boxes, arrange({ mode: 'layered', boxes, edges: flowEdges }).placements);
		const at = (id: string) => after.find((box) => box.id === id)!;
		expect(at('n0').y).toBeLessThan(at('n1').y);
		expect(at('n2').y).toBeLessThan(at('n3').y);
		expect(at('n3').y).toBeLessThan(at('n5').y);
	});

	test('force: joined cards end up nearer each other than unjoined ones', () => {
		const boxes: Box[] = Array.from({ length: 8 }, (_, index) => ({ id: `n${index}`, x: (index % 4) * 600, y: Math.floor(index / 4) * 600, w: 240, h: 240 }));
		const edges: Edge[] = [['n0', 'n7'], ['n7', 'n3'], ['n3', 'n0'], ['n1', 'n6'], ['n6', 'n4'], ['n4', 'n1']].map(([from, to]) => ({ from, to }));
		const after = apply(boxes, arrange({ mode: 'force', boxes, edges }).placements);
		const far = (a: string, b: string) => { const p = centre(after.find((box) => box.id === a)!), q = centre(after.find((box) => box.id === b)!); return Math.hypot(p.x - q.x, p.y - q.y); };
		expect(far('n0', 'n7')).toBeLessThan(far('n0', 'n1') + far('n7', 'n6'));
		expect(far('n0', 'n7')).toBeLessThan(900);
	});

	test('a graph layout sets unjoined cards in a grid below, and says so', () => {
		const boxes = heap(11);
		const result = arrange({ mode: 'tree', boxes, edges: orgEdges });
		const after = apply(boxes, result.placements);
		const bottom = Math.max(...after.filter((box) => Number(box.id.slice(1)) < 8).map((box) => box.y + box.h));
		expect(after.filter((box) => Number(box.id.slice(1)) >= 8).every((box) => box.y > bottom)).toBe(true);
		expect(result.note).toMatch(/3 items aren’t joined/);
	});

	test('with no arrows a graph layout falls back and says why; auto picks by what is there', () => {
		const boxes = heap(9);
		const result = arrange({ mode: 'mindmap', boxes });
		expect(result.mode).toBe('columns');
		expect(result.note).toMatch(/table_connect/);
		expect(chooseArrangement(boxes, orgEdges)).toBe('tree');
		expect(chooseArrangement(boxes, flowEdges)).toBe('layered');
		expect(chooseArrangement(boxes.map((box) => ({ ...box, h: 240 })))).toBe('grid');
		expect(isForest(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }])).toBe(false);
	});

	test('cluster: named groups each in their own block, apart, leftovers last', () => {
		const boxes = heap(10);
		const result = arrange({ mode: 'cluster', boxes, groups: [{ name: 'Listening', ids: ['n0', 'n1', 'n2', 'n3'] }, { name: 'Writing', ids: ['n4', 'n5', 'n1'] }] });
		expect(result.groups).toEqual([{ name: 'Listening', ids: ['n0', 'n1', 'n2', 'n3'] }, { name: 'Writing', ids: ['n4', 'n5'] }, { ids: ['n6', 'n7', 'n8', 'n9'] }]);
		const after = apply(boxes, result.placements);
		const box = (ids: string[]) => { const set = after.filter((one) => ids.includes(one.id)); const x = Math.min(...set.map((one) => one.x)), y = Math.min(...set.map((one) => one.y)); return { id: ids[0], x, y, w: Math.max(...set.map((one) => one.x + one.w)) - x, h: Math.max(...set.map((one) => one.y + one.h)) - y }; };
		const blocks = result.groups!.map((group) => box(group.ids));
		// Room for a frame around each: 40 of padding either side, and space between.
		expect(layoutIssues(blocks.map((one) => ({ ...one, x: one.x - 80, y: one.y - 80, w: one.w + 160, h: one.h + 160 }))).overlaps).toEqual([]);
	});

	test('clustersBy groups by kind, colour, or what arrows join', () => {
		const items = [{ id: 'a', kind: 'book' }, { id: 'b', kind: 'post', color: 'yellow' }, { id: 'c', kind: 'book', color: 'yellow' }, { id: 'd', kind: 'note' }];
		expect(clustersBy(items, 'kind')).toEqual([{ name: 'Books', ids: ['a', 'c'] }, { name: 'Posts', ids: ['b'] }, { name: 'Notes', ids: ['d'] }]);
		expect(clustersBy(items, 'color').map((group) => group.name)).toEqual(['None', 'Yellow']);
		expect(clustersBy(items, 'connected', [{ from: 'a', to: 'd' }])).toEqual([{ ids: ['a', 'd'] }]);
		expect(components(['a', 'b', 'c'], [{ from: 'b', to: 'c' }])).toEqual([['b', 'c'], ['a']]);
	});

	test('separate parts a pile with small moves, and leaves a clean layout alone', () => {
		const pile: Box[] = Array.from({ length: 9 }, (_, index) => ({ id: `p${index}`, x: 0, y: 0, w: 200, h: 200 }));
		expect(clean(separate(pile))).toBe(true);
		const tidy: Box[] = [{ id: 'a', x: 0, y: 0, w: 200, h: 200 }, { id: 'b', x: 220, y: 0, w: 200, h: 200 }];
		expect(separate(tidy)).toEqual(tidy);
	});

	test('a big table is quick', () => {
		const boxes = heap(150);
		const edges = Array.from({ length: 149 }, (_, index) => ({ from: `n${Math.floor(index / 3)}`, to: `n${index + 1}` }));
		const started = performance.now();
		for (const mode of ['tree', 'layered', 'force', 'radial'] as const) expect(clean(apply(boxes, arrange({ mode, boxes, edges }).placements)), mode).toBe(true);
		expect(performance.now() - started).toBeLessThan(4000);
	});
});
