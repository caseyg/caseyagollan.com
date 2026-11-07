import type { PageServerLoad } from './$types';
import libraryData from '../../../../static/library/graph.json';

// Book-ID query links also need request-time HTML with their selected book.
export const prerender = false;

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

interface MinifiedGraphData {
	nodes: MinifiedNode[];
	links: { s: string; t: string }[];
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

// Resolve the requested book without sending or waiting for the full graph.
export const load: PageServerLoad = async ({ params, url }) => {
	const bookId = url.searchParams.get('book');
	const match = (libraryData as MinifiedGraphData).nodes.find(
		(node) => node.g === 'book' && (params.isbn ? node.n === params.isbn : bookId !== null && String(node.b) === bookId)
	);
	return {
		graphData: null,
		isbn: params.isbn || null,
		initialBook: match ? expandNode(match) : null
	};
};
