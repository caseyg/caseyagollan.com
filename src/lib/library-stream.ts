// Split the library graph into batches so the first books render immediately
// and the rest grow into the scene a few at a time.

export interface StreamNode {
	id: string;
	group: string;
	dateacquired?: string;
}

export interface StreamLink {
	source: string | { id: string };
	target: string | { id: string };
}

export interface GraphBatch<N extends StreamNode, L extends StreamLink> {
	nodes: N[];
	links: L[];
}

const endpoint = (end: string | { id: string }) => (typeof end === 'object' ? end.id : end);

/**
 * Orders books with the selected book first, then most recently acquired, and
 * groups them into batches. Each batch carries the subject nodes and links its
 * books need that earlier batches did not already add.
 */
export function libraryGraphBatches<N extends StreamNode, L extends StreamLink>(
	graph: { nodes: N[]; links: L[] },
	{ firstId, firstSize = 48, size = 12 }: { firstId?: string | null; firstSize?: number; size?: number } = {}
): GraphBatch<N, L>[] {
	const byId = new Map(graph.nodes.map((node) => [node.id, node]));
	const linksByBook = new Map<string, L[]>();
	for (const link of graph.links) {
		for (const end of [endpoint(link.source), endpoint(link.target)]) {
			if (byId.get(end)?.group !== 'book') continue;
			const links = linksByBook.get(end) ?? [];
			links.push(link);
			linksByBook.set(end, links);
		}
	}

	const books = graph.nodes
		.filter((node) => node.group === 'book')
		.sort((a, b) => {
			if (a.id === firstId) return -1;
			if (b.id === firstId) return 1;
			return (b.dateacquired ?? '').localeCompare(a.dateacquired ?? '');
		});

	const added = new Set<N>();
	const addedLinks = new Set<L>();
	const batches: GraphBatch<N, L>[] = [];
	let batch: GraphBatch<N, L> = { nodes: [], links: [] };
	const add = (node: N | undefined) => {
		if (!node || added.has(node)) return;
		added.add(node);
		batch.nodes.push(node);
	};

	for (const book of books) {
		add(book);
		for (const link of linksByBook.get(book.id) ?? []) {
			if (addedLinks.has(link)) continue;
			add(byId.get(endpoint(link.source)));
			add(byId.get(endpoint(link.target)));
			addedLinks.add(link);
			batch.links.push(link);
		}
		const limit = batches.length === 0 ? firstSize : size;
		if (batch.nodes.filter((node) => node.group === 'book').length >= limit) {
			batches.push(batch);
			batch = { nodes: [], links: [] };
		}
	}

	// Nodes and links unrelated to any book still belong in the final batch.
	for (const node of graph.nodes) add(node);
	for (const link of graph.links) {
		if (!addedLinks.has(link)) batch.links.push(link);
	}
	if (batch.nodes.length || batch.links.length) batches.push(batch);
	return batches;
}
