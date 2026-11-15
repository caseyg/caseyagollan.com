/** Which books a library category filter keeps, shared by the graph and the shelves. */

interface CategoryNode {
	id: string;
	group: string;
	bookid?: number;
}

interface CategoryLink {
	source: string | { id: string };
	target: string | { id: string };
}

const linkEnd = (end: string | { id: string }) => (typeof end === 'object' ? end.id : end);

/**
 * The ids a category keeps: its subject node, when the graph has one, the books
 * linked to it, and the books whose catalog tags name it. Tags such as
 * "Nonfiction" have no node of their own, so they gather books by tag, along
 * with the subjects two or more of those books share.
 */
export function libraryCategoryMembers(
	name: string,
	nodes: CategoryNode[],
	links: CategoryLink[],
	tagsOf: (bookid?: number) => string[] | undefined
): Set<string> {
	const members = new Set<string>();
	for (const node of nodes) {
		if (node.group === 'ddc' && node.id === name) members.add(node.id);
		else if (node.group === 'book' && tagsOf(node.bookid)?.includes(name)) members.add(node.id);
	}
	for (const link of links) {
		if (linkEnd(link.target) === name && members.has(name)) members.add(linkEnd(link.source));
	}
	if (!members.has(name)) {
		// A tag has no node of its own to link its books, so keep the subjects
		// two or more of them share; the graph then still shows how they connect.
		const shared = new Map<string, number>();
		for (const link of links) {
			if (members.has(linkEnd(link.source))) shared.set(linkEnd(link.target), (shared.get(linkEnd(link.target)) ?? 0) + 1);
		}
		for (const [subject, count] of shared) if (count >= 2) members.add(subject);
	}
	return members;
}

/** Top-level Dewey classes, named as the graph's subject nodes are. */
export const libraryDdcClasses: Record<string, string> = {
	'000': 'Computer science, information & general works',
	'100': 'Philosophy & psychology',
	'200': 'Religion',
	'300': 'Social sciences',
	'400': 'Language',
	'500': 'Science',
	'600': 'Technology',
	'700': 'Arts & recreation',
	'800': 'Literature',
	'900': 'History'
};

export function libraryDdcClass(ddcCode?: string) {
	return ddcCode ? ddcCode.charAt(0) + '00' : '000';
}
