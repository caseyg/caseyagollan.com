/**
 * Mind map mode on a table: a tree of blocks joined by arrows, built and walked from the keyboard
 * (the shortcuts are Knotend's). This is the part with no canvas in it: reading the blocks and
 * arrows as a tree, where an arrow key goes, and what moving or removing a node changes. The
 * canvas side is `components/tables/canvas/mindMap.ts`; the tree is drawn by the Outline layout
 * (`table-arrange.ts`), which orders siblings by where their middles stand, top to bottom.
 */
import type { Box } from './table-layout';

/** Where a table keeps the mode, in its document's `meta`. */
export const MIND_MAP = 'mindMap';

/** Whether a document's meta asks for mind map mode. */
export const mindMapOf = (meta: Record<string, unknown> | undefined): boolean => meta?.[MIND_MAP] === true;

/** An arrow tied to a block at both ends: it runs from a node to one beneath it. */
export interface MindLink {
	id: string;
	from: string;
	to: string;
}

export type MindDirection = 'up' | 'down' | 'left' | 'right';

export interface MindGraph {
	has(id: string): boolean;
	/** The middle of a node's box. */
	middle(id: string): { x: number; y: number };
	/** What a node hangs from, and what hangs from it, each top to bottom. */
	parents(id: string): string[];
	children(id: string): string[];
	/** The arrows leaving a node, and those arriving. */
	out(id: string): MindLink[];
	into(id: string): MindLink[];
	/** Everything joined to a node by arrows, itself included, in reading order: each node, then what hangs from it. */
	tree(id: string): string[];
	/** The nodes of a node's tree that hang from nothing (or, in a loop, the topmost). */
	roots(id: string): string[];
	/** How many arrows down from a root each node of a node's tree is. */
	depths(id: string): Map<string, number>;
	/** A node's siblings, itself included: the children of its first parent, or the roots of its tree. */
	siblings(id: string): string[];
	ids(): string[];
}

/** Blocks and the arrows among them, read as trees. Arrows to anything not given are left out. */
export function mindGraph(boxes: Box[], links: MindLink[]): MindGraph {
	const byId = new Map(boxes.map((box) => [box.id, box]));
	const kept = links.filter((link) => byId.has(link.from) && byId.has(link.to) && link.from !== link.to);
	const middle = (id: string) => {
		const box = byId.get(id)!;
		return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
	};
	const inOrder = (ids: string[]) => [...new Set(ids)].sort((a, b) => middle(a).y - middle(b).y || middle(a).x - middle(b).x);
	const out = (id: string) => kept.filter((link) => link.from === id);
	const into = (id: string) => kept.filter((link) => link.to === id);
	const children = (id: string) => inOrder(out(id).map((link) => link.to));
	const parents = (id: string) => inOrder(into(id).map((link) => link.from));
	const joined = (id: string) => {
		const found = new Set([id]);
		const queue = [id];
		for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
			for (const other of [...children(next), ...parents(next)]) if (!found.has(other)) { found.add(other); queue.push(other); }
		}
		return found;
	};
	const rootsOf = (set: Set<string>) => {
		const tops = inOrder([...set].filter((id) => !parents(id).length));
		return tops.length ? tops : inOrder([...set]).slice(0, 1);
	};
	const walk = (id: string) => {
		const set = joined(id);
		const depth = new Map<string, number>();
		const order: string[] = [];
		const visit = (node: string, level: number) => {
			if (depth.has(node)) return;
			depth.set(node, level);
			order.push(node);
			for (const kid of children(node)) visit(kid, level + 1);
		};
		for (const root of rootsOf(set)) visit(root, 0);
		// A loop with no way in from a root is still walked.
		for (const rest of inOrder([...set])) visit(rest, 0);
		return { order, depth, set };
	};
	return {
		has: (id) => byId.has(id),
		middle,
		parents,
		children,
		out,
		into,
		tree: (id) => (byId.has(id) ? walk(id).order : []),
		roots: (id) => (byId.has(id) ? rootsOf(joined(id)) : []),
		depths: (id) => (byId.has(id) ? walk(id).depth : new Map()),
		siblings: (id) => {
			if (!byId.has(id)) return [];
			const parent = parents(id)[0];
			return parent ? children(parent) : rootsOf(joined(id));
		},
		ids: () => [...byId.keys()]
	};
}

/** The nearest of some nodes in a direction from a node: straight ahead counts for more than off to one side. */
function beside(graph: MindGraph, id: string, direction: MindDirection, among: string[]): string | undefined {
	const here = graph.middle(id);
	let best: string | undefined, least = Infinity;
	for (const other of among) {
		if (other === id) continue;
		const there = graph.middle(other);
		const dx = there.x - here.x, dy = there.y - here.y;
		const along = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
		const across = Math.abs(direction === 'left' || direction === 'right' ? dy : dx);
		if (along < 1) continue;
		const score = along + across * 2;
		if (score < least) { least = score; best = other; }
	}
	return best;
}

/**
 * Where an arrow key goes from a node. Left is what it hangs from and right is what hangs from it
 * (the one most level with it). Up and down go through the nodes of its tree that are as deep as
 * it is, so the last of one branch leads to the first of the next; past the end, and for things
 * joined to nothing, it is whatever stands nearest that way.
 */
export function mindStep(graph: MindGraph, id: string, direction: MindDirection): string | undefined {
	if (!graph.has(id)) return undefined;
	const level = (ids: string[]) => ids.toSorted((a, b) => Math.abs(graph.middle(a).y - graph.middle(id).y) - Math.abs(graph.middle(b).y - graph.middle(id).y))[0];
	const tree = graph.tree(id);
	if (direction === 'left' || direction === 'right') {
		const next = direction === 'left' ? graph.parents(id) : graph.children(id);
		if (next.length) return level(next);
		// The end of a branch is the end; only something joined to nothing looks around.
		return tree.length > 1 ? undefined : beside(graph, id, direction, graph.ids());
	}
	const depth = graph.depths(id);
	const row = tree.filter((other) => depth.get(other) === depth.get(id));
	const next = row[row.indexOf(id) + (direction === 'down' ? 1 : -1)];
	return next ?? beside(graph, id, direction, graph.ids());
}

/** A place in sibling order between two nodes' middles (either may be missing: before the first, after the last). */
function between(graph: MindGraph, above: string | undefined, below: string | undefined): number {
	if (above !== undefined && below !== undefined) return (graph.middle(above).y + graph.middle(below).y) / 2;
	if (above !== undefined) return graph.middle(above).y + 1;
	if (below !== undefined) return graph.middle(below).y - 1;
	return 0;
}

/** Where a new node counts as standing, to come right after a node among its siblings. */
export function afterSibling(graph: MindGraph, id: string): number {
	const siblings = graph.siblings(id);
	return between(graph, id, siblings[siblings.indexOf(id) + 1]);
}

/** Where a new node counts as standing, to come last among a node's children. */
export function lastChild(graph: MindGraph, id: string): number {
	const children = graph.children(id);
	return children.length ? graph.middle(children[children.length - 1]).y + 1 : graph.middle(id).y;
}

/** What moving a node changes: an arrow that now leaves another node, and where the node counts as standing among its new siblings. */
export interface MindMove {
	retie?: { link: string; from: string };
	/** The height its middle is counted at when siblings are put in order. */
	middle: number;
}

/**
 * Moving a node as an outliner does: up and down change places with the sibling that way; left
 * takes it out a level, to come right after what it hung from; right takes it in a level, to
 * hang last from the sibling above it. Undefined where there is nowhere to go.
 */
export function mindMove(graph: MindGraph, id: string, direction: MindDirection): MindMove | undefined {
	if (!graph.has(id)) return undefined;
	const siblings = graph.siblings(id);
	const index = siblings.indexOf(id);
	const parent = graph.parents(id)[0];
	if (direction === 'up') return index > 0 ? { middle: between(graph, siblings[index - 2], siblings[index - 1]) } : undefined;
	if (direction === 'down') return index < siblings.length - 1 ? { middle: between(graph, siblings[index + 1], siblings[index + 2]) } : undefined;
	const link = parent && graph.into(id).find((one) => one.from === parent);
	if (direction === 'left') {
		const grandparent = parent && graph.parents(parent)[0];
		if (!link || !grandparent) return undefined;
		return { retie: { link: link.id, from: grandparent }, middle: afterSibling(graph, parent) };
	}
	const above = siblings[index - 1];
	if (!link || !above) return undefined;
	return { retie: { link: link.id, from: above }, middle: lastChild(graph, above) };
}

/** What removing a node changes besides the node: arrows that now leave its parent, arrows that go, and what to select after. */
export interface MindRemoval {
	retie: { link: string; from: string }[];
	drop: string[];
	next?: string;
}

/**
 * Removing a node without losing what hangs from it: its children hang from its parent instead
 * (or stand on their own, when it had none). The selection goes to the sibling above, the one
 * below, or the parent.
 */
export function mindRemoval(graph: MindGraph, id: string): MindRemoval {
	if (!graph.has(id)) return { retie: [], drop: [] };
	const parent = graph.parents(id)[0];
	const siblings = graph.siblings(id);
	const index = siblings.indexOf(id);
	const kept = new Set(parent ? graph.children(parent) : []);
	const retie: MindRemoval['retie'] = [], drop = graph.into(id).map((link) => link.id);
	for (const link of graph.out(id)) {
		// Something already hanging from the parent needs no second arrow.
		if (parent && !kept.has(link.to)) { retie.push({ link: link.id, from: parent }); kept.add(link.to); }
		else drop.push(link.id);
	}
	const next = (parent ? siblings[index - 1] ?? siblings[index + 1] : undefined) ?? parent ?? graph.children(id)[0] ?? siblings[index - 1] ?? siblings[index + 1];
	return { retie, drop, ...(next ? { next } : {}) };
}

/** One line of the help: the keys to press together, and what they do. */
export interface MindKey {
	keys: string[];
	label: string;
	group: 'Move around' | 'Build' | 'Change';
}

/** The mode's shortcuts, as the help lists them, with the modifier names of the reader's keyboard. */
export function mindMapKeys(mac = true): MindKey[] {
	const command = mac ? '⌘' : 'Ctrl', option = mac ? '⌥' : 'Alt', shift = mac ? '⇧' : 'Shift';
	return [
		{ keys: ['↑ ↓ ← →'], label: 'Go to the next node that way', group: 'Move around' },
		{ keys: [shift, '↑ ↓ ← →'], label: 'Select more', group: 'Move around' },
		{ keys: ['Enter'], label: 'Edit the node, or start one with nothing selected', group: 'Build' },
		{ keys: ['Tab'], label: 'Add a child', group: 'Build' },
		{ keys: [command, 'Enter'], label: 'Add a sibling', group: 'Build' },
		{ keys: [shift, 'Tab'], label: 'Add a parent (over all the siblings selected)', group: 'Build' },
		{ keys: [option, shift, '→'], label: 'Insert a node before its children', group: 'Build' },
		{ keys: [option, shift, '←'], label: 'Insert a node after its parents', group: 'Build' },
		{ keys: [option, '↑ ↓'], label: 'Move the node up or down', group: 'Change' },
		{ keys: [option, '← →'], label: 'Move it out or in a level', group: 'Change' },
		{ keys: ['Backspace'], label: 'Delete; what hung from it moves up', group: 'Change' },
		{ keys: [command, 'Z'], label: 'Undo', group: 'Change' },
		{ keys: [command, shift, 'Z'], label: 'Redo', group: 'Change' },
		{ keys: ['?'], label: 'Show or hide these', group: 'Change' }
	];
}
