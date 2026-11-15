// Runs the library graph's force layout off the main thread and streams each
// tick's positions back, so the page only has to draw.
// @ts-expect-error d3-force-3d ships without type declarations.
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force-3d';

export interface LayoutRequest {
	ids: string[];
	links: [string, string][];
	ticks: number;
	/** Starting positions, three numbers per node, to lay out from where the nodes already are. */
	positions?: Float32Array;
	/** Send only the settled layout instead of every tick. */
	finalOnly?: boolean;
	/** Looser spacing for a small set of books, so whole covers fit side by side. */
	linkDistance?: number;
	charge?: number;
}

export interface LayoutTick {
	tick: number;
	positions: Float32Array;
	done: boolean;
}

type LayoutNode = { id: string; x?: number; y?: number; z?: number };

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
	const { ids, links, ticks, positions: start, finalOnly = false, linkDistance = 30, charge = -60 } = event.data;
	const nodes: LayoutNode[] = ids.map((id, index) => start
		? { id, x: start[index * 3], y: start[index * 3 + 1], z: start[index * 3 + 2] }
		: { id });
	// Match three-forcegraph's defaults: 3D, link distance 30, charge -60, centered.
	const simulation = forceSimulation(nodes, 3)
		.force('link', forceLink(links.map(([source, target]) => ({ source, target }))).id((node: { id: string }) => node.id).distance(linkDistance))
		.force('charge', forceManyBody().strength(charge))
		.stop();
	// Settle around where the nodes started, not the origin.
	const count = Math.max(nodes.length, 1);
	const mean = (axis: 'x' | 'y' | 'z') => nodes.reduce((sum, node) => sum + (node[axis] ?? 0), 0) / count;
	simulation.force('center', start ? forceCenter(mean('x'), mean('y'), mean('z')) : forceCenter());
	for (let tick = 0; tick < ticks; tick++) {
		simulation.tick();
		const done = tick === ticks - 1;
		if (finalOnly && !done) continue;
		const positions = new Float32Array(nodes.length * 3);
		nodes.forEach((node, index) => {
			positions[index * 3] = node.x ?? 0;
			positions[index * 3 + 1] = node.y ?? 0;
			positions[index * 3 + 2] = node.z ?? 0;
		});
		const message: LayoutTick = { tick, positions, done };
		(self as unknown as Worker).postMessage(message, [positions.buffer]);
	}
};
