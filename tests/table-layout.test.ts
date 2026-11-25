import { describe, expect, test } from 'bun:test';
import { arrowCrossings, columnLayout, columnsLayout, segmentHitsBox, gridLayout, layoutIssues, tidyLayout, type Box, type Placement } from '../src/lib/table-layout';

const apply = (boxes: Box[], placements: Placement[]) => boxes.map((box) => ({ ...box, ...placements.find((place) => place.id === box.id) }));

// The Pauline Oliveros table: notes grown tall with their text, set down where a 200-high note would end.
const stacked: Box[] = [
	{ id: 'a', x: 300, y: 0, w: 200, h: 340 },
	{ id: 'b', x: 300, y: 220, w: 200, h: 300 },
	{ id: 'c', x: 300, y: 440, w: 200, h: 680 },
	{ id: 'photo', x: 0, y: 0, w: 280, h: 240 }
];

describe('table layout', () => {
	test('finds overlapping cards, worst first, and leaves cards a grid step apart alone', () => {
		const issues = layoutIssues(stacked);
		expect(issues.overlaps.map((overlap) => overlap.ids)).toEqual([['a', 'b'], ['b', 'c']]);
		expect(layoutIssues([{ id: 'x', x: 0, y: 0, w: 100, h: 100 }, { id: 'y', x: 120, y: 0, w: 100, h: 100 }])).toEqual({ overlaps: [], crowded: [] });
		expect(layoutIssues([{ id: 'x', x: 0, y: 0, w: 100, h: 100 }, { id: 'y', x: 104, y: 0, w: 100, h: 100 }]).crowded).toEqual([['x', 'y']]);
	});

	test('a label inside a card is not an overlap', () => {
		expect(layoutIssues([{ id: 'card', x: 0, y: 0, w: 300, h: 300 }, { id: 'label', x: 20, y: 20, w: 100, h: 40 }]).overlaps).toEqual([]);
	});

	test('tidy pushes overlapping cards down their column, by their real heights', () => {
		const moved = tidyLayout(stacked);
		expect(moved.map((move) => move.id)).toEqual(['b', 'c']);
		const after = apply(stacked, moved);
		expect(layoutIssues(after)).toEqual({ overlaps: [], crowded: [] });
		expect(after.find((box) => box.id === 'b')!.y).toBe(360);
		expect(after.find((box) => box.id === 'photo')).toEqual(stacked[3]);
	});

	test('a column stacks by measured height, never rounding a card smaller', () => {
		const boxes = [{ id: 'a', x: 0, y: 0, w: 200, h: 211 }, { id: 'b', x: 0, y: 50, w: 200, h: 90 }];
		expect(columnLayout(boxes)).toEqual([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 240 }]);
	});

	test('a grid lines its columns up whatever the cards’ widths', () => {
		const boxes: Box[] = [
			{ id: 'book', x: 0, y: 0, w: 180, h: 300 }, { id: 'post', x: 200, y: 0, w: 240, h: 240 },
			{ id: 'photo', x: 0, y: 400, w: 280, h: 240 }, { id: 'note', x: 300, y: 400, w: 200, h: 200 }
		];
		const placed = gridLayout(boxes, 2);
		expect(placed).toEqual([{ id: 'book', x: 0, y: 0 }, { id: 'post', x: 300, y: 0 }, { id: 'photo', x: 0, y: 320 }, { id: 'note', x: 300, y: 320 }]);
		expect(layoutIssues(apply(boxes, placed)).overlaps).toEqual([]);
	});

	test('columns (masonry) fills the shortest column next', () => {
		const boxes: Box[] = [{ id: 'tall', x: 0, y: 0, w: 200, h: 600 }, { id: 'short', x: 220, y: 0, w: 200, h: 100 }, { id: 'next', x: 0, y: 700, w: 200, h: 100 }];
		expect(columnsLayout(boxes, 2)).toEqual([{ id: 'tall', x: 0, y: 0 }, { id: 'short', x: 220, y: 0 }, { id: 'next', x: 220, y: 120 }]);
	});
});

test('a card put somewhere on purpose stays; what it lands on moves', () => {
	const boxes: Box[] = [{ id: 'old', x: 0, y: 100, w: 200, h: 200 }, { id: 'new', x: 0, y: 100, w: 300, h: 100 }];
	expect(tidyLayout(boxes, 20, 'new')).toEqual([{ id: 'old', x: 0, y: 220 }]);
});

test('an arrow through a card it doesn’t join is a crossing', () => {
	const boxes: Box[] = [{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { id: 'mid', x: 150, y: 0, w: 100, h: 100 }, { id: 'b', x: 300, y: 0, w: 100, h: 100 }, { id: 'below', x: 150, y: 200, w: 100, h: 100 }];
	expect(arrowCrossings([{ id: 'arrow', a: { x: 50, y: 50 }, b: { x: 350, y: 50 }, skip: ['a', 'b'] }], boxes)).toEqual([['arrow', 'mid']]);
	expect(segmentHitsBox({ x: 0, y: 150 }, { x: 400, y: 150 }, boxes[1])).toBe(false);
});
