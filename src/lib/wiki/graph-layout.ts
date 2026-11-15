import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import type { WikiGraphData, WikiGraphNode } from './types';

export interface PlacedNode extends WikiGraphNode {
	x: number;
	y: number;
	r: number;
}

export interface GraphLayout {
	nodes: PlacedNode[];
	links: { source: string; target: string }[];
	/** The SVG viewBox that fits every node and its label. */
	viewBox: string;
}

type SimNode = SimulationNodeDatum & WikiGraphNode;

export const nodeRadius = (degree: number) => 3 + Math.sqrt(degree) * 1.6;

/**
 * Places the graph once, ahead of time, so it renders complete with the page instead of settling
 * in front of the reader. d3-force starts from fixed positions, so a page lays out the same way
 * on the server and in the browser.
 */
export function layoutGraph(graph: WikiGraphData, { center }: { center?: string } = {}): GraphLayout {
	const nodes: SimNode[] = graph.nodes.map((node) => ({ ...node, ...(node.slug === center ? { fx: 0, fy: 0 } : {}) }));
	const known = new Set(nodes.map((node) => node.slug));
	const links: SimulationLinkDatum<SimNode>[] = graph.links.filter((link) => known.has(link.source) && known.has(link.target)).map((link) => ({ ...link }));
	const simulation = forceSimulation(nodes)
		.force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((node) => node.slug).distance(70).strength(0.5))
		.force('charge', forceManyBody().strength(-220).distanceMax(400))
		.force('collide', forceCollide<SimNode>((node) => nodeRadius(node.degree) + 12))
		// Pages that link nowhere would drift off; a light pull keeps them in a ring around the rest.
		.force('x', forceX(0).strength(0.06))
		.force('y', forceY(0).strength(0.06))
		.force('center', forceCenter(0, 0))
		.stop();
	simulation.tick(Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())));
	const placed = nodes.map((node) => ({ slug: node.slug, title: node.title, degree: node.degree, x: Math.round(node.x! * 10) / 10, y: Math.round(node.y! * 10) / 10, r: Math.round(nodeRadius(node.degree) * 10) / 10 }));
	const pad = 24;
	const xs = placed.flatMap((node) => [node.x - node.r - pad - 40, node.x + node.r + pad + 40]);
	const ys = placed.flatMap((node) => [node.y - node.r - pad, node.y + node.r + pad + 12]);
	let [minX, maxX, minY, maxY] = placed.length ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] : [0, 0, 0, 0];
	// A few pages shouldn't be blown up to fill the space; keep at least this much room around them.
	const [minWidth, minHeight] = [300, 200];
	if (maxX - minX < minWidth) [minX, maxX] = [(minX + maxX - minWidth) / 2, (minX + maxX + minWidth) / 2];
	if (maxY - minY < minHeight) [minY, maxY] = [(minY + maxY - minHeight) / 2, (minY + maxY + minHeight) / 2];
	return {
		nodes: placed,
		links: graph.links.filter((link) => known.has(link.source) && known.has(link.target)),
		viewBox: [minX, minY, maxX - minX, maxY - minY].map((value) => Math.round(value)).join(' ')
	};
}
