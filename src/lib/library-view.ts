export const librarySortModes = ['dateacquired', 'publicationYear', 'ddc', 'color'] as const;
export type LibrarySort = typeof librarySortModes[number];

export function readLibraryView(url: URL) {
	const requestedSort = url.searchParams.get('sort');
	const sort = librarySortModes.find((mode) => mode === requestedSort) ?? librarySortModes[0];
	return { shelves: url.searchParams.get('view') === 'shelves', sort };
}

export function writeLibraryView(url: URL, shelves: boolean, sort: LibrarySort) {
	const next = new URL(url);
	if (shelves) next.searchParams.set('view', 'shelves');
	else next.searchParams.delete('view');
	if (sort !== librarySortModes[0]) next.searchParams.set('sort', sort);
	else next.searchParams.delete('sort');
	return next;
}
