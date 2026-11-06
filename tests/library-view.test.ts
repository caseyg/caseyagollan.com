import { test, expect } from 'bun:test';
import { readLibraryView, writeLibraryView, librarySortModes } from '../src/lib/library-view';

test('library view links round-trip every sort in both views', () => {
	for (const shelves of [false, true]) {
		for (const sort of librarySortModes) {
			const url = writeLibraryView(new URL('https://example.com/library/123?other=keep#book'), shelves, sort);
			expect(readLibraryView(url)).toEqual({ shelves, sort });
			expect(url.pathname).toBe('/library/123');
			expect(url.searchParams.get('other')).toBe('keep');
			expect(url.hash).toBe('#book');
		}
	}
});

test('missing or invalid view options fall back to graph and acquisition order', () => {
	for (const query of ['', '?view=invalid&sort=invalid']) {
		expect(readLibraryView(new URL(`https://example.com/library${query}`)))
			.toEqual({ shelves: false, sort: 'dateacquired' });
	}
});

test('returning to default options removes their query parameters', () => {
	const url = writeLibraryView(new URL('https://example.com/library?view=shelves&sort=ddc'), false, 'dateacquired');
	expect(url.search).toBe('');
});
