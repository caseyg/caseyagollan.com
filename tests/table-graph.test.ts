import { describe, expect, test } from 'bun:test';
import { graphLayout, graphScore, separate } from '../src/lib/table-graph';

const boxes = (count: number, w = 280, h = 320) => Array.from({ length: count }, (_, index) => ({ id: `c${index}`, x: 0, y: 0, w, h: h + (index % 3) * 40 }));
const overlapping = (spots: Map<string, { x: number; y: number }>, all: ReturnType<typeof boxes>) => {
	let found = 0;
	const placed = all.map((box) => ({ ...box, ...spots.get(box.id)! }));
	for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
		const a = placed[i], b = placed[j];
		if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) found++;
	}
	return found;
};
const apart = (spots: Map<string, { x: number; y: number }>, a: string, b: string) => Math.hypot(spots.get(a)!.x - spots.get(b)!.x, spots.get(a)!.y - spots.get(b)!.y);

describe('graphLayout', () => {
	const all = boxes(30);
	// A hub with eight spokes, two chains, and loose likeness between a few.
	const edges = [
		...Array.from({ length: 8 }, (_, index) => ({ from: 'c0', to: `c${index + 1}` })),
		{ from: 'c10', to: 'c11' }, { from: 'c11', to: 'c12' }, { from: 'c20', to: 'c21' },
		{ from: 'c13', to: 'c14', weight: 0.4 }, { from: 'c22', to: 'c23', weight: 0.3 }, { from: 'c12', to: 'c24', weight: 0.3 }
	];

	test('the same cards and ties always land in the same places', () => {
		const one = graphLayout(all, edges), two = graphLayout(all, edges);
		expect([...one.spots]).toEqual([...two.spots]);
		expect(one.seed).toBe(two.seed);
	});

	test('no card sits on another, and every card is placed', () => {
		const laid = graphLayout(all, edges);
		expect(laid.spots.size).toBe(30);
		expect(overlapping(laid.spots, all)).toBe(0);
	});

	test('a hub’s spokes gather round it, nearer than cards it has no tie to', () => {
		const laid = graphLayout(all, edges);
		const spokes = Array.from({ length: 8 }, (_, index) => apart(laid.spots, 'c0', `c${index + 1}`));
		const others = ['c16', 'c17', 'c18', 'c19', 'c25', 'c26', 'c27', 'c28', 'c29'].map((id) => apart(laid.spots, 'c0', id));
		const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
		expect(mean(spokes)).toBeLessThan(mean(others));
	});

	test('the best of several seeds crosses no more lines than the first seed alone', () => {
		expect(graphLayout(all, edges, { seeds: 12 }).score).toBeLessThanOrEqual(graphLayout(all, edges, { seeds: 1 }).score);
	});

	test('a lone card and no cards are fine', () => {
		expect(graphLayout([], []).spots.size).toBe(0);
		expect(graphLayout(boxes(1), []).spots.get('c0')).toEqual({ x: 0, y: 0 });
	});
});

describe('graphScore and separate', () => {
	test('crossed lines are counted', () => {
		const square = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 400, y: 400, w: 10, h: 10 }, { id: 'c', x: 400, y: 0, w: 10, h: 10 }, { id: 'd', x: 0, y: 400, w: 10, h: 10 }];
		expect(graphScore(square, [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }]).crossings).toBe(1);
		expect(graphScore(square, [{ from: 'a', to: 'c' }, { from: 'd', to: 'b' }]).crossings).toBe(0);
	});

	test('piled boxes are pushed apart', () => {
		const piled = Array.from({ length: 6 }, (_, index) => ({ id: `p${index}`, x: index * 5, y: index * 5, w: 200, h: 200 }));
		const moved = separate(piled, 20);
		expect(overlapping(new Map(moved.map((box) => [box.id, box])), piled as never)).toBe(0);
	});
});
