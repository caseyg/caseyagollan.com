import type { PageServerLoad } from './$types';
import libraryData from '../../../../static/library/graph.json';

// Keep the library index prerendered while serving arbitrary ISBN deep links.
export const prerender = 'auto';

interface MinifiedNode {
	i: string; // id
	g: string; // group
	au?: string; // author surname
	af?: string; // full author name
	w?: string; // workcode
	b?: number; // bookid
	n?: string; // isbn
	p?: number; // pages
	d?: string; // dateacquired
	e?: string; // date added to LibraryThing
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
	authorLastName?: string;
	authorName?: string;
	workcode?: string;
	bookid?: number;
	isbn?: string;
	pages?: number;
	dateacquired?: string;
	entrydate?: string;
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
	if (n.au) node.authorLastName = n.au;
	if (n.af) node.authorName = n.af;
	if (n.w) node.workcode = n.w;
	if (n.b) node.bookid = n.b;
	if (n.n) node.isbn = n.n;
	if (n.p) node.pages = n.p;
	if (n.d) node.dateacquired = n.d;
	if (n.e) node.entrydate = n.e;
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

export const load: PageServerLoad = async ({ params, platform }) => {
	let graphData: GraphData | null = null;

	try {
		// In Cloudflare, fetch from static path
		// In dev/build, read from filesystem
		if (platform?.env) {
			// Running on Cloudflare - data will be loaded client-side
			return { graphData: null, isbn: params.isbn || null };
		}

		// Development/build - read from static folder
		const minified: MinifiedGraphData = libraryData;

		graphData = {
			nodes: minified.nodes.map(expandNode),
			links: minified.links.map(expandLink)
		};
	} catch {
		// Fallback - client will fetch
		return { graphData: null, isbn: params.isbn || null };
	}

	return { graphData, isbn: params.isbn || null };
};
