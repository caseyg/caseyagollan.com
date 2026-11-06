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

export function libraryShelfYear(
	book: { dateacquired?: string; publicationYear?: number },
	sort: LibrarySort
): string {
	if (sort === 'dateacquired') {
		// LibraryThing dates are calendar dates; preserve their year across time zones.
		const year = book.dateacquired?.match(/^(\d{4})-/)?.[1];
		return year && Number(year) > 0 ? year : 'Unknown year';
	}
	return book.publicationYear && Number.isInteger(book.publicationYear) && book.publicationYear > 0
		? String(book.publicationYear) : 'Unknown year';
}
