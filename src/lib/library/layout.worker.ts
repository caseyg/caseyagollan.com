// Runs the library graph's force layout off the main thread and streams each
// tick's positions back, so the page only has to draw.
// @ts-expect-error d3-force-3d ships without type declarations.
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force-3d';

export interface LayoutRequest {
	ids: string[];
	links: [string, string][];
	ticks: number;
}

export interface LayoutTick {
	tick: number;
	positions: Float32Array;
	done: boolean;
}

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
	const { ids, links, ticks } = event.data;
	const nodes: { id: string; x?: number; y?: number; z?: number }[] = ids.map((id) => ({ id }));
	// Match three-forcegraph's defaults: 3D, link distance 30, charge -60, centered.
	const simulation = forceSimulation(nodes, 3)
		.force('link', forceLink(links.map(([source, target]) => ({ source, target }))).id((node: { id: string }) => node.id))
		.force('charge', forceManyBody().strength(-60))
		.force('center', forceCenter())
		.stop();
	for (let tick = 0; tick < ticks; tick++) {
		simulation.tick();
		const positions = new Float32Array(nodes.length * 3);
		nodes.forEach((node, index) => {
			positions[index * 3] = node.x ?? 0;
			positions[index * 3 + 1] = node.y ?? 0;
			positions[index * 3 + 2] = node.z ?? 0;
		});
		const message: LayoutTick = { tick, positions, done: tick === ticks - 1 };
		(self as unknown as Worker).postMessage(message, [positions.buffer]);
	}
};
