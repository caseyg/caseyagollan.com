import { test, expect } from 'bun:test';
import { rollupIndexPosts, type Post } from '../src/lib/posts-types';
import { entryFacets, entryTypes, facetLabels, facetMenu, facetsHref, matchesFacets, parseFacets, type FacetEntry } from '../src/lib/posts-filter';

const target = 'https://bsky.app/profile/did:plc:author/post/123';
const like: Post = { type: 'like', date: '2025-07-11T00:49:35-04:00', slug: '123', content: '', filePath: 'likes/123.md', properties: { 'like-of': [target] } };
const repost: Post = { ...like, type: 'repost', slug: '123-repost', date: '2025-07-11T00:49:38-04:00', properties: { 'repost-of': [target] } };
const note: Post = { type: 'note', date: '2025-07-10T10:00:00-04:00', slug: 'n', content: 'Hello', filePath: 'notes/n.md', category: ['IndieWeb', 'indieweb'] };

test('rolled-up entries stand for every member type', () => {
	const entries = rollupIndexPosts([repost, like, note]);
	expect(entries.map(entryTypes)).toEqual([['like', 'repost'], ['note']]);
	expect(entryFacets(note)).toEqual({ types: ['note'], tags: ['indieweb'], year: '2025' });
});

test('facets are read leniently and ordered canonically', () => {
	const facets = parseFacets(new URLSearchParams('types=reply,notes,bogus&tags=Maps,indieweb&years=2024,2026,soon'));
	expect(facets).toEqual({ types: ['note', 'reply'], tags: ['indieweb', 'maps'], years: ['2026', '2024'] });
	expect(parseFacets(new URLSearchParams('types=notes+likes')).types).toEqual(['note', 'like']);
	expect(parseFacets(new URLSearchParams())).toEqual({ types: [], tags: [], years: [] });
});

test('every selection has one URL', () => {
	expect(facetsHref({})).toBe('/posts');
	expect(facetsHref({}, 2)).toBe('/posts/page/2');
	expect(facetsHref({ types: ['reply', 'note'] })).toBe('/posts/filter?types=notes,replies');
	expect(facetsHref({ types: ['note'] }, 3)).toBe('/posts/filter?types=notes&page=3');
	expect(facetsHref({ years: ['2026'] })).toBe('/2026/');
	expect(facetsHref({ tags: ['IndieWeb'] })).toBe('/tags/indieweb/');
	expect(facetsHref({ years: ['2026'] }, 2)).toBe('/posts/filter?years=2026&page=2');
	expect(facetsHref({ types: ['note'], tags: ['maps'], years: ['2025', '2026'] })).toBe('/posts/filter?types=notes&tags=maps&years=2026,2025');
});

const entries: FacetEntry[] = [
	{ types: ['note'], tags: ['indieweb'], year: '2026' },
	{ types: ['note'], tags: [], year: '2025' },
	{ types: ['like', 'repost'], tags: [], year: '2026' },
	{ types: ['article'], tags: ['indieweb', 'maps'], year: '2024' }
];
const tagNames = { indieweb: 'IndieWeb', maps: 'maps' };

test('choices in a facet widen, facets narrow each other', () => {
	const shown = (facets: Parameters<typeof matchesFacets>[1]) => entries.filter((entry) => matchesFacets(entry, facets)).length;
	expect(shown({ types: ['note', 'like'], tags: [], years: [] })).toBe(3);
	expect(shown({ types: ['note'], tags: [], years: ['2026'] })).toBe(1);
	expect(shown({ types: [], tags: ['indieweb'], years: ['2024', '2026'] })).toBe(2);
});

test('the menu counts intersections and leaves out dead ends', () => {
	const menu = facetMenu(entries, tagNames, { years: ['2026'] });
	const option = (value: string) => menu.find((item) => item.value === value);
	// Within 2026 there is one note and no article.
	expect(option('note')).toMatchObject({ count: 1, checked: false, href: '/posts/filter?types=notes&years=2026', group: 'Type' });
	expect(option('article')).toBeUndefined();
	expect(option('tag:maps')).toBeUndefined();
	expect(option('tag:indieweb')).toMatchObject({ label: '#IndieWeb', count: 1 });
	// A facet's own choices do not narrow its counts, so another year can be added.
	expect(option('2026')).toMatchObject({ count: 2, checked: true, href: '/posts' });
	expect(option('2024')).toMatchObject({ count: 1, checked: false, href: '/posts/filter?years=2026,2024' });
	expect(option('tags')).toMatchObject({ href: '/tags/' });
	expect(option('tags')?.checked).toBeUndefined();
});

test('nothing chosen lists everything, and labels say what is chosen', () => {
	const menu = facetMenu(entries, tagNames);
	expect(menu.filter((item) => item.group === 'Year').map((item) => [item.value, item.count])).toEqual([['2026', 2], ['2025', 1], ['2024', 1]]);
	expect(menu.find((item) => item.value === '2026')?.href).toBe('/2026/');
	expect(facetLabels({ types: ['note'], tags: ['indieweb'], years: ['2026'] }, tagNames)).toEqual(['Notes', '#IndieWeb', '2026']);
});
