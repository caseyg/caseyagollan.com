import { describe, expect, test } from 'bun:test';
import { afterSibling, lastChild, MIND_MAP, mindGraph, mindMapKeys, mindMapOf, mindMove, mindRemoval, mindStep } from '../src/lib/table-mindmap';

/**
 * An outline as the layout draws one:
 *
 *   root ─┬─ a ─┬─ a1
 *         │     └─ a2
 *         ├─ b ─── b1
 *         └─ c
 *
 * and `loose`, joined to nothing, below it.
 */
const box = (id: string, x: number, y: number) => ({ id, x, y, w: 100, h: 20 });
const boxes = [box('root', 0, 60), box('a', 200, 20), box('a1', 400, 0), box('a2', 400, 40), box('b', 200, 80), box('b1', 400, 80), box('c', 200, 120), box('loose', 0, 400)];
const link = (from: string, to: string) => ({ id: `${from}>${to}`, from, to });
const links = [link('root', 'a'), link('root', 'b'), link('root', 'c'), link('a', 'a1'), link('a', 'a2'), link('b', 'b1')];
const graph = mindGraph(boxes, links);

describe('a table read as a tree', () => {
	test('children and parents follow the arrows, top to bottom', () => {
		expect(graph.children('root')).toEqual(['a', 'b', 'c']);
		expect(graph.parents('a2')).toEqual(['a']);
		expect(graph.siblings('b')).toEqual(['a', 'b', 'c']);
		expect(graph.roots('a2')).toEqual(['root']);
	});

	test('a tree is read node by node, each before what hangs from it', () => {
		expect(graph.tree('b1')).toEqual(['root', 'a', 'a1', 'a2', 'b', 'b1', 'c']);
		expect(graph.tree('loose')).toEqual(['loose']);
	});

	test('arrows to things that are not there, or from a thing to itself, are left out', () => {
		const odd = mindGraph(boxes, [...links, link('a', 'gone'), link('c', 'c')]);
		expect(odd.children('a')).toEqual(['a1', 'a2']);
		expect(odd.children('c')).toEqual([]);
	});

	test('a loop is still walked once', () => {
		const loop = mindGraph(boxes, [link('a', 'b'), link('b', 'c'), link('c', 'a')]);
		expect(loop.tree('b').toSorted()).toEqual(['a', 'b', 'c']);
		expect(loop.roots('b')).toEqual(['a']);
	});

	test('the mode is read from the document’s meta', () => {
		expect(mindMapOf({ [MIND_MAP]: true })).toBe(true);
		expect(mindMapOf({ [MIND_MAP]: 'yes' })).toBe(false);
		expect(mindMapOf({})).toBe(false);
		expect(mindMapOf(undefined)).toBe(false);
	});
});

describe('arrow keys', () => {
	test('left is the parent, right the child most level with the node', () => {
		expect(mindStep(graph, 'a', 'left')).toBe('root');
		expect(mindStep(graph, 'root', 'right')).toBe('b');
		expect(mindStep(graph, 'b', 'right')).toBe('b1');
	});

	test('the end of a branch is the end', () => {
		expect(mindStep(graph, 'a1', 'right')).toBeUndefined();
		expect(mindStep(graph, 'root', 'left')).toBeUndefined();
	});

	test('up and down go through the nodes as deep as this one, across branches', () => {
		expect(mindStep(graph, 'a', 'down')).toBe('b');
		expect(mindStep(graph, 'c', 'up')).toBe('b');
		expect(mindStep(graph, 'a2', 'down')).toBe('b1');
		expect(mindStep(graph, 'b1', 'up')).toBe('a2');
	});

	test('past the last of its level, and from something joined to nothing, it is whatever is nearest that way', () => {
		expect(mindStep(graph, 'root', 'down')).toBe('loose');
		expect(mindStep(graph, 'loose', 'up')).toBe('root');
		expect(mindStep(graph, 'loose', 'right')).toBe('c');
		expect(mindStep(graph, 'a1', 'up')).toBeUndefined();
	});

	test('a node that is not there goes nowhere', () => {
		expect(mindStep(graph, 'gone', 'down')).toBeUndefined();
	});
});

/** The children of a node once a move's `middle` is counted for the moved node. */
const reordered = (id: string, middle: number, parent: string, moved = links) => {
	const at = boxes.map((one) => (one.id === id ? { ...one, y: middle - one.h / 2 } : one));
	return mindGraph(at, moved).children(parent);
};

describe('moving a node', () => {
	test('up and down change places with the sibling that way', () => {
		expect(reordered('b', mindMove(graph, 'b', 'up')!.middle, 'root')).toEqual(['b', 'a', 'c']);
		expect(reordered('b', mindMove(graph, 'b', 'down')!.middle, 'root')).toEqual(['a', 'c', 'b']);
		expect(reordered('a', mindMove(graph, 'a', 'down')!.middle, 'root')).toEqual(['b', 'a', 'c']);
		expect(mindMove(graph, 'a', 'up')).toBeUndefined();
		expect(mindMove(graph, 'c', 'down')).toBeUndefined();
	});

	test('left takes it out a level, to come right after what it hung from', () => {
		const plan = mindMove(graph, 'a1', 'left')!;
		expect(plan.retie).toEqual({ link: 'a>a1', from: 'root' });
		const moved = links.map((one) => (one.id === 'a>a1' ? { ...one, from: 'root' } : one));
		expect(reordered('a1', plan.middle, 'root', moved)).toEqual(['a', 'a1', 'b', 'c']);
		expect(mindMove(graph, 'a', 'left')).toBeUndefined();
	});

	test('right takes it in a level, to hang last from the sibling above', () => {
		const plan = mindMove(graph, 'b', 'right')!;
		expect(plan.retie).toEqual({ link: 'root>b', from: 'a' });
		const moved = links.map((one) => (one.id === 'root>b' ? { ...one, from: 'a' } : one));
		expect(reordered('b', plan.middle, 'a', moved)).toEqual(['a1', 'a2', 'b']);
		expect(mindMove(graph, 'a', 'right')).toBeUndefined();
	});

	test('new nodes are counted after a sibling, or last among children', () => {
		const added = (middle: number, parent: string, from = parent) => mindGraph([...boxes, { id: 'new', x: 0, y: middle - 10, w: 100, h: 20 }], [...links, link(from, 'new')]).children(parent);
		expect(added(afterSibling(graph, 'a'), 'root')).toEqual(['a', 'new', 'b', 'c']);
		expect(added(afterSibling(graph, 'c'), 'root')).toEqual(['a', 'b', 'c', 'new']);
		expect(added(lastChild(graph, 'a'), 'a')).toEqual(['a1', 'a2', 'new']);
		expect(added(lastChild(graph, 'c'), 'c')).toEqual(['new']);
	});
});

describe('removing a node', () => {
	test('what hung from it hangs from its parent, and the sibling above is selected', () => {
		expect(mindRemoval(graph, 'b')).toEqual({ retie: [{ link: 'b>b1', from: 'root' }], drop: ['root>b'], next: 'a' });
		expect(mindRemoval(graph, 'a').next).toBe('b');
	});

	test('an only child gives the selection to its parent', () => {
		expect(mindRemoval(graph, 'b1')).toEqual({ retie: [], drop: ['b>b1'], next: 'b' });
	});

	test('without a parent its children stand on their own', () => {
		expect(mindRemoval(graph, 'root')).toEqual({ retie: [], drop: ['root>a', 'root>b', 'root>c'], next: 'a' });
	});

	test('a child the parent already holds gets no second arrow', () => {
		const twice = mindGraph(boxes, [...links, link('root', 'b1')]);
		expect(mindRemoval(twice, 'b')).toMatchObject({ retie: [], drop: ['root>b', 'b>b1'] });
	});
});

describe('the list of keys', () => {
	test('names every shortcut once, with the keyboard’s own modifiers', () => {
		const mac = mindMapKeys(true), other = mindMapKeys(false);
		expect(mac.length).toBe(other.length);
		expect(new Set(mac.map((key) => key.label)).size).toBe(mac.length);
		expect(mac.find((key) => key.label === 'Add a sibling')?.keys).toEqual(['⌘', 'Enter']);
		expect(other.find((key) => key.label === 'Add a sibling')?.keys).toEqual(['Ctrl', 'Enter']);
		for (const label of ['Add a child', 'Add a parent (over all the siblings selected)', 'Undo', 'Redo', 'Show or hide these']) expect(mac.some((key) => key.label === label)).toBe(true);
	});
});
