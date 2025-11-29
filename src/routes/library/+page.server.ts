import type { PageServerLoad } from './$types';
import { readFileSync } from 'fs';
import { join } from 'path';

interface MinifiedNode {
	i: string; // id
	g: string; // group
	w?: string; // workcode
	b?: number; // bookid
	n?: string; // isbn
	p?: number; // pages
	d?: string; // dateacquired
	y?: number; // publicationYear
	c?: string; // ddcCode
	m?: string; // img
	x?: number; // width
	z?: number; // height
	a?: string; // averageColor
	t?: number; // points
}

interface MinifiedLink {
	s: string; // source
	t: string; // target
}

interface MinifiedGraphData {
	nodes: MinifiedNode[];
	links: MinifiedLink[];
}

interface Node {
	id: string;
	group: string;
	workcode?: string;
	bookid?: number;
	isbn?: string;
	pages?: number;
	dateacquired?: string;
	publicationYear?: number;
	ddcCode?: string;
	img?: string;
	w?: number;
	h?: number;
	averageColor?: string;
	points?: number;
}

interface Link {
	source: string;
	target: string;
}

interface GraphData {
	nodes: Node[];
	links: Link[];
}

// Expand minified keys back to full names
function expandNode(n: MinifiedNode): Node {
	const node: Node = { id: n.i, group: n.g };
	if (n.w) node.workcode = n.w;
	if (n.b) node.bookid = n.b;
	if (n.n) node.isbn = n.n;
	if (n.p) node.pages = n.p;
	if (n.d) node.dateacquired = n.d;
	if (n.y) node.publicationYear = n.y;
	if (n.c) node.ddcCode = n.c;
	if (n.m) node.img = n.m;
	if (n.x) node.w = n.x;
	if (n.z) node.h = n.z;
	if (n.a) node.averageColor = n.a;
	if (n.t) node.points = n.t;
	return node;
}

function expandLink(l: MinifiedLink): Link {
	return { source: l.s, target: l.t };
}

export const load: PageServerLoad = async ({ platform }) => {
	let graphData: GraphData;

	try {
		// In Cloudflare, fetch from static path
		// In dev/build, read from filesystem
		if (platform?.env) {
			// Running on Cloudflare - data will be loaded client-side
			return { graphData: null };
		}

		// Development/build - read from static folder
		const filePath = join(process.cwd(), 'static', 'library', 'graph.json');
		const rawData = readFileSync(filePath, 'utf-8');
		const minified: MinifiedGraphData = JSON.parse(rawData);

		graphData = {
			nodes: minified.nodes.map(expandNode),
			links: minified.links.map(expandLink)
		};
	} catch {
		// Fallback - client will fetch
		return { graphData: null };
	}

	return { graphData };
};
