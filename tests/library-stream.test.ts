import { expect, test } from 'bun:test';
import { libraryGraphBatches } from '../src/lib/library-stream';
import catalog from '../static/library/graph.json';

const graph = {
	nodes: catalog.nodes.map((node) => ({ id: node.i, group: node.g, dateacquired: node.d })),
	links: catalog.links.map((link) => ({ source: link.s, target: link.t }))
};

test('batches add every node and link exactly once', () => {
	const batches = libraryGraphBatches(graph, { firstSize: 40, size: 25 });
	const nodes = batches.flatMap((batch) => batch.nodes);
	const links = batches.flatMap((batch) => batch.links);
	expect(new Set(nodes).size).toBe(graph.nodes.length);
	expect(nodes.length).toBe(graph.nodes.length);
	expect(links.length).toBe(graph.links.length);
	expect(batches[0].nodes.filter((node) => node.group === 'book').length).toBe(40);
});

test('each link arrives with or after both of its nodes', () => {
	const present = new Set<string>();
	for (const batch of libraryGraphBatches(graph)) {
		for (const node of batch.nodes) present.add(node.id);
		for (const link of batch.links) {
			expect(present.has(link.source)).toBe(true);
			expect(present.has(link.target)).toBe(true);
		}
	}
});

test('the selected book comes first, then the most recently acquired', () => {
	const books = graph.nodes.filter((node) => node.group === 'book');
	const oldest = [...books].sort((a, b) => (a.dateacquired ?? '').localeCompare(b.dateacquired ?? ''))[0];
	const [first] = libraryGraphBatches(graph, { firstId: oldest.id });
	const firstBooks = first.nodes.filter((node) => node.group === 'book');
	expect(firstBooks[0].id).toBe(oldest.id);
	expect((firstBooks[1].dateacquired ?? '') >= (firstBooks[2].dateacquired ?? '')).toBe(true);
});
