/**
 * Mind map mode, the canvas side (`$lib/table-mindmap` holds the rules): while a table's document
 * asks for it, the keyboard builds and walks a tree of text blocks joined by arrows, the same
 * blocks and arrows pasted Markdown makes, and the tree is set out again as an outline after
 * every change to its shape.
 *
 * Keys are taken only from the select tool at rest. While words are being typed the text editor
 * keeps every key but Enter, which ends the editing (Shift+Enter is still a new line, and a list
 * keeps Enter for its next item). With the mode off nothing here listens.
 */
import { createShapeId, getArrowBindings, renderPlaintextFromRichText, startEditingShapeWithRichText, toRichText, type Editor, type TLArrowShape, type TLShape, type TLShapeId, type TLTextShape } from 'tldraw';
import { GRID, type Box } from '$lib/table-layout';
import { afterSibling, lastChild, mindGraph, mindMove, mindRemoval, mindStep, type MindDirection, type MindGraph, type MindLink } from '$lib/table-mindmap';

/** What the mode needs of the table's editor module, which owns layout and arrows. */
export interface MindMapDeps {
	/** Whether the table is in mind map mode now. */
	on(): boolean;
	/**
	 * Sets these blocks out as an outline, `anchor` staying where it is. `middles` says where a
	 * block's middle counts as standing when siblings are put in order (see `MindMove.middle`).
	 */
	layOut(editor: Editor, ids: string[], anchor: string, middles?: Map<string, number>): void;
	/** An arrow from one block to another, tied to both; returns the arrow. */
	tie(editor: Editor, from: TLShapeId, to: TLShapeId): TLShapeId | undefined;
	openSpot(editor: Editor, size: { w: number; h: number }): { x: number; y: number };
	/** Brings a block into view, moving the view no further than that takes. */
	reveal(editor: Editor, id: TLShapeId): void;
}

/** A node the mode made is one line until it has more words than this; then it wraps at `WRAP_WIDTH`. */
const ONE_LINE = 32;
const WRAP_WIDTH = 280;

const long = (id: string) => (id.startsWith('shape:') ? id : `shape:${id}`) as TLShapeId;
const short = (id: string) => id.replace(/^shape:/, '');
/** What can be a node: anything that takes up room. Arrows are the tree's lines; drawings run over things. */
const isNode = (shape: TLShape | undefined): shape is TLShape => !!shape && !['arrow', 'draw', 'line', 'highlight'].includes(shape.type);
const ARROWS: Record<string, MindDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** A block's siblings on the table (or in its area) and the arrows among them, as trees. */
function read(editor: Editor, parentId: TLShape['parentId']): MindGraph {
	const nodes = editor.getSortedChildIdsForParent(parentId).map((id) => editor.getShape(id)).filter(isNode);
	const ids = new Set(nodes.map((shape) => shape.id));
	const boxes: Box[] = nodes.flatMap((shape) => {
		const bounds = editor.getShapePageBounds(shape);
		return bounds ? [{ id: short(shape.id), x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }] : [];
	});
	const links: MindLink[] = editor.getCurrentPageShapes().filter((shape): shape is TLArrowShape => shape.type === 'arrow').flatMap((arrow) => {
		const ends = getArrowBindings(editor, arrow);
		return ends.start && ends.end && ids.has(ends.start.toId) && ids.has(ends.end.toId) ? [{ id: short(arrow.id), from: short(ends.start.toId), to: short(ends.end.toId) }] : [];
	});
	return mindGraph(boxes, links);
}

/** An arrow's end tied to another block instead. */
function retie(editor: Editor, arrowId: string, terminal: 'start' | 'end', to: string) {
	const arrow = editor.getShape(long(arrowId));
	const binding = arrow?.type === 'arrow' ? getArrowBindings(editor, arrow as TLArrowShape)[terminal] : undefined;
	if (!binding) return;
	const { id: _id, ...rest } = binding;
	editor.deleteBinding(binding);
	editor.createBinding({ ...rest, toId: long(to) });
}

export function installMindMap(editor: Editor, deps: MindMapDeps): () => void {
	const container = editor.getContainer();
	/** The node Shift+arrow reaches on from: the one selected last. */
	let lead: TLShapeId | undefined;

	/** The node keys act on: the one selected, or of several, the one reached last. */
	const current = (): TLShape | undefined => {
		const selected = editor.getSelectedShapes().filter(isNode);
		return selected.find((shape) => shape.id === lead) ?? selected[selected.length - 1];
	};

	/** The tree a node belongs to is set out again, its root staying put. */
	const layOut = (graph: MindGraph, id: string, anchor?: string, middles?: Map<string, number>) => {
		const tree = graph.tree(id);
		if (tree.length > 1) deps.layOut(editor, tree, anchor && tree.includes(anchor) ? anchor : graph.roots(id)[0], middles);
	};

	/** An empty text block, for now beside the node it will be joined to, or where there is room. */
	const make = (beside: TLShape | undefined, under?: { x: number; y: number }): TLShapeId => {
		const id = createShapeId();
		const bounds = beside && editor.getShapePageBounds(beside);
		const spot = under ?? (bounds ? { x: bounds.maxX + GRID * 3, y: bounds.y } : deps.openSpot(editor, { w: WRAP_WIDTH, h: GRID * 2 }));
		// A node in an area keeps its place from the area's corner.
		const local = beside ? editor.getShapeParentTransform(beside).clone().invert().applyToPoint(spot) : spot;
		editor.createShape<TLTextShape>({ id, type: 'text', ...(beside ? { parentId: beside.parentId } : {}), x: local.x, y: local.y, props: { richText: toRichText(''), autoSize: true }, meta: { mind: true } });
		return id;
	};

	/** The new node is selected and takes the caret. */
	const write = (id: TLShapeId) => {
		lead = id;
		editor.select(id);
		startEditingShapeWithRichText(editor, id);
		deps.reveal(editor, id);
	};

	/** One change to the tree: one step to undo. */
	const change = (work: () => TLShapeId | void) => {
		editor.markHistoryStoppingPoint('mind map');
		const made: { id?: TLShapeId } = {};
		editor.run(() => { made.id = work() ?? undefined; });
		if (made.id) write(made.id);
	};

	const addChild = (node: TLShape) => change(() => {
		const before = read(editor, node.parentId), anchor = before.roots(short(node.id))[0];
		const id = make(node);
		deps.tie(editor, node.id, id);
		layOut(read(editor, node.parentId), short(node.id), anchor, new Map([[short(id), lastChild(before, short(node.id))]]));
		return id;
	});

	const addSibling = (node: TLShape) => change(() => {
		const before = read(editor, node.parentId), anchor = before.roots(short(node.id))[0];
		const parent = before.parents(short(node.id))[0];
		if (!parent) {
			// Beside a root there is nothing to hang from: a new tree starts under this one.
			const tree = editor.getShapesPageBounds(before.tree(short(node.id)).map(long)) ?? editor.getShapePageBounds(node)!;
			return make(node, { x: editor.getShapePageBounds(node)!.x, y: tree.maxY + GRID * 2 });
		}
		const id = make(node);
		deps.tie(editor, long(parent), id);
		layOut(read(editor, node.parentId), short(node.id), anchor, new Map([[short(id), afterSibling(before, short(node.id))]]));
		return id;
	});

	/**
	 * A new node above this one, standing in the line so the tree stays a tree. `all` takes over
	 * every arrow that arrived here (Knotend's "between a node and its parents"). Otherwise it takes
	 * this node from its parent, and with it any of its siblings selected along with it, which
	 * gathers several branches under one new node.
	 */
	const addParent = (node: TLShape, all: boolean) => change(() => {
		const before = read(editor, node.parentId), anchor = before.roots(short(node.id))[0];
		const parent = before.parents(short(node.id))[0];
		const id = make(node);
		if (all) {
			for (const link of before.into(short(node.id))) retie(editor, link.id, 'end', id);
			deps.tie(editor, id, node.id);
		} else {
			const together = editor.getSelectedShapes().filter((shape) => isNode(shape) && shape.parentId === node.parentId && before.parents(short(shape.id))[0] === parent);
			for (const one of together.some((shape) => shape.id === node.id) ? together : [node]) {
				const link = parent && before.into(short(one.id)).find((arrow) => arrow.from === parent);
				if (link) retie(editor, link.id, 'start', id);
				else deps.tie(editor, id, one.id);
			}
			if (parent) deps.tie(editor, long(parent), id);
		}
		layOut(read(editor, node.parentId), short(node.id), anchor, new Map([[short(id), before.middle(short(node.id)).y]]));
		return id;
	});

	/** A new node between this one and everything that hung from it. */
	const insertBelow = (node: TLShape) => change(() => {
		const before = read(editor, node.parentId), anchor = before.roots(short(node.id))[0];
		const id = make(node);
		for (const link of before.out(short(node.id))) retie(editor, link.id, 'start', id);
		deps.tie(editor, node.id, id);
		layOut(read(editor, node.parentId), short(node.id), anchor, new Map([[short(id), before.middle(short(node.id)).y]]));
		return id;
	});

	const move = (node: TLShape, direction: MindDirection) => {
		const graph = read(editor, node.parentId);
		const plan = mindMove(graph, short(node.id), direction);
		if (!plan) return;
		change(() => {
			const anchor = graph.roots(short(node.id))[0];
			if (plan.retie) retie(editor, plan.retie.link, 'start', plan.retie.from);
			layOut(read(editor, node.parentId), short(node.id), anchor, new Map([[short(node.id), plan.middle]]));
		});
		deps.reveal(editor, node.id);
	};

	const remove = () => {
		const selected = editor.getSelectedShapes();
		const nodes = selected.filter(isNode);
		const after: { next?: { id: string; parentId: TLShape['parentId'] } } = {};
		change(() => {
			for (const node of nodes) {
				const plan = mindRemoval(read(editor, node.parentId), short(node.id));
				for (const tie of plan.retie) retie(editor, tie.link, 'start', tie.from);
				editor.deleteShapes(plan.drop.map(long));
				if (plan.next && !nodes.some((other) => short(other.id) === plan.next)) after.next = { id: plan.next, parentId: node.parentId };
			}
			// Arrows tied to them at one end only go too, and any arrows selected along with them.
			editor.deleteShapes(nodes.flatMap((node) => editor.getBindingsToShape(node.id, 'arrow').map((binding) => binding.fromId)));
			editor.deleteShapes(selected.map((shape) => shape.id));
			if (after.next && editor.getShape(long(after.next.id))) layOut(read(editor, after.next.parentId), after.next.id);
		});
		const to = after.next && editor.getShape(long(after.next.id));
		lead = to?.id;
		if (to) { editor.select(to.id); deps.reveal(editor, to.id); }
	};

	const step = (direction: MindDirection, extend: boolean) => {
		const from = current();
		if (!from) {
			// Nothing selected: the walk starts at whatever is nearest the middle of the view.
			const centre = editor.getViewportPageBounds().center;
			const nearest = editor.getCurrentPageShapes().filter(isNode).map((shape) => ({ shape, bounds: editor.getShapePageBounds(shape) })).filter((one) => one.bounds).sort((a, b) => Math.hypot(a.bounds!.center.x - centre.x, a.bounds!.center.y - centre.y) - Math.hypot(b.bounds!.center.x - centre.x, b.bounds!.center.y - centre.y))[0];
			if (nearest) { lead = nearest.shape.id; editor.select(nearest.shape.id); deps.reveal(editor, nearest.shape.id); }
			return;
		}
		const to = mindStep(read(editor, from.parentId), short(from.id), direction);
		if (!to) return;
		const id = long(to);
		const selected = editor.getSelectedShapeIds();
		// Reaching back onto something already selected lets go of the one it was reached from.
		if (extend) editor.select(...(selected.includes(id) ? selected.filter((one) => one !== from.id) : [...selected, id]));
		else editor.select(id);
		lead = id;
		deps.reveal(editor, id);
	};

	const take = (event: KeyboardEvent) => {
		event.preventDefault();
		event.stopImmediatePropagation();
		if (!container.contains(event.target as Node | null)) editor.focus();
	};

	const onKey = (event: KeyboardEvent) => {
		if (!deps.on() || event.isComposing || editor.getIsReadonly()) return;
		const target = event.target as HTMLElement | null;
		const inside = !!target && container.contains(target);
		// The canvas, or nothing in particular: never a menu, a field or a button somewhere else on the page.
		if (!inside && target !== document.body && target !== document.documentElement) return;
		const command = event.metaKey || event.ctrlKey;
		if (editor.getEditingShapeId()) {
			if (event.key !== 'Enter' || event.shiftKey || command || event.altKey || !inside) return;
			// Inside a list, Enter is the next item.
			const writing = editor.getRichTextEditor();
			if (writing && writing.state.selection.$from.depth > 1) return;
			take(event);
			editor.complete();
			return;
		}
		if (!editor.isIn('select.idle') || target?.closest('input, textarea, [contenteditable="true"]')) return;
		const node = current();
		const direction = ARROWS[event.key];
		if (direction) {
			if (command) return;
			take(event);
			if (event.altKey && event.shiftKey) {
				if (node && direction === 'right') insertBelow(node);
				else if (node && direction === 'left') addParent(node, true);
			} else if (event.altKey) { if (node) move(node, direction); }
			else step(direction, event.shiftKey);
		} else if (event.key === 'Enter' && !event.altKey && !event.shiftKey) {
			if (command) { if (node) { take(event); addSibling(node); } }
			else if (!editor.getSelectedShapeIds().length) { take(event); change(() => make(undefined)); }
			else if (node && 'richText' in node.props) { take(event); lead = node.id; editor.select(node.id); startEditingShapeWithRichText(editor, node.id); }
		} else if (event.key === 'Tab' && !command && !event.altKey) {
			// With nothing selected Tab is the browser's, so the keyboard can still leave the canvas.
			if (!node) return;
			take(event);
			if (event.shiftKey) addParent(node, false);
			else addChild(node);
		} else if ((event.key === 'Backspace' || event.key === 'Delete') && !command && !event.altKey) {
			if (!editor.getSelectedShapeIds().length) return;
			take(event);
			remove();
		}
	};

	// When editing ends: a node left empty is gone (tldraw removes it), and its arrows with it; one
	// with new words may have changed size, so its tree is set out again.
	let was: { id: TLShapeId; parentId: TLShape['parentId']; parent?: string; arrows: TLShapeId[] } | undefined;
	const offEdit = editor.sideEffects.registerAfterChangeHandler('instance_page_state', (prev, next) => {
		if (prev.editingShapeId === next.editingShapeId) return;
		const ended = was;
		const begun = next.editingShapeId ? editor.getShape(next.editingShapeId) : undefined;
		was = begun && deps.on() ? { id: begun.id, parentId: begun.parentId, parent: read(editor, begun.parentId).parents(short(begun.id))[0], arrows: editor.getBindingsToShape(begun.id, 'arrow').map((binding) => binding.fromId) } : undefined;
		if (!ended || !deps.on()) return;
		// After tldraw has finished ending the edit, in the same step to undo.
		setTimeout(() => {
			const shape = editor.getShape(ended.id);
			if (!shape) {
				editor.run(() => {
					editor.deleteShapes(ended.arrows.filter((id) => editor.getShape(id)));
					if (ended.parent && editor.getShape(long(ended.parent))) layOut(read(editor, ended.parentId), ended.parent);
				});
				if (ended.parent && editor.getShape(long(ended.parent)) && !editor.getEditingShapeId() && !editor.getSelectedShapeIds().length) { lead = long(ended.parent); editor.select(lead); }
				return;
			}
			editor.run(() => {
				// A node made here that has grown past a few words wraps, as a pasted one does.
				if (shape.type === 'text' && shape.meta.mind && (shape as TLTextShape).props.autoSize) {
					const words = renderPlaintextFromRichText(editor, (shape as TLTextShape).props.richText);
					if (words.length > ONE_LINE || words.includes('\n')) editor.updateShape<TLTextShape>({ id: shape.id, type: 'text', props: { autoSize: false, w: WRAP_WIDTH } });
				}
				layOut(read(editor, shape.parentId), short(shape.id));
			});
		});
	});

	window.addEventListener('keydown', onKey, true);
	return () => {
		window.removeEventListener('keydown', onKey, true);
		offEdit();
	};
}
