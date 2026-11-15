import { test, expect } from 'bun:test';
import { libraryCategoryMembers } from '../src/lib/library-category';

const nodes = [
	{ id: 'Arts', group: 'ddc' },
	{ id: 'History', group: 'ddc' },
	{ id: 'Book A', group: 'book', bookid: 1 },
	{ id: 'Book B', group: 'book', bookid: 2 },
	{ id: 'Book C', group: 'book', bookid: 3 }
];
const links = [
	{ source: 'Book A', target: 'Arts' },
	{ source: { id: 'Book B' }, target: { id: 'History' } },
	{ source: 'Book C', target: 'History' }
];
const tags: Record<number, string[]> = { 1: ['Nonfiction'], 2: ['Nonfiction', 'Arts'] };
const tagsOf = (bookid?: number) => (bookid ? tags[bookid] : undefined);

test('a subject keeps its node, its linked books and books tagged with it', () => {
	expect([...libraryCategoryMembers('Arts', nodes, links, tagsOf)].sort()).toEqual(['Arts', 'Book A', 'Book B']);
});

test('links resolved to node objects count like string ids', () => {
	expect([...libraryCategoryMembers('History', nodes, links, tagsOf)].sort()).toEqual(['Book B', 'Book C', 'History']);
});

test('a tag with no subject node keeps its books and the subjects they share', () => {
	expect([...libraryCategoryMembers('Nonfiction', nodes, links, tagsOf)].sort()).toEqual(['Book A', 'Book B']);
	const shared = [...links, { source: 'Book A', target: 'History' }];
	expect([...libraryCategoryMembers('Nonfiction', nodes, shared, tagsOf)].sort()).toEqual(['Book A', 'Book B', 'History']);
	expect(libraryCategoryMembers('Unknown', nodes, links, tagsOf).size).toBe(0);
});
