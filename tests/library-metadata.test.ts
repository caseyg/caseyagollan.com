import { expect, test } from 'bun:test';
import { libraryMetadata } from '../src/lib/library-metadata';
import { bookTags } from '../utils/search-filters';
import catalog from '../utils/librarything_caseygollan.json';

test('saved sidebar metadata includes catalog categories without Google Books', () => {
	for (const [id, book] of Object.entries(catalog)) {
		if (book.public === 'false') continue;
		expect(libraryMetadata(Number(id)).categories).toEqual(expect.arrayContaining(bookTags(book as unknown as Parameters<typeof bookTags>[0])));
	}
});

test('unknown books have no unrelated enrichment', () => {
	expect(libraryMetadata()).toEqual({});
	expect(libraryMetadata(-1)).toEqual({});
});
