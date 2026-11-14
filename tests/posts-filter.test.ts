import { test, expect } from 'bun:test';
import { rollupIndexPosts, type Post } from '../src/lib/posts-types';
import { entryTypes, parseTypesParam, toggleHref, typeFilterOptions, typesHref, type PostType } from '../src/lib/posts-filter';

const available: PostType[] = ['note', 'reply', 'like', 'repost'];
const target = 'https://bsky.app/profile/did:plc:author/post/123';
const like: Post = { type: 'like', date: '2025-07-11T00:49:35-04:00', slug: '123', content: '', filePath: 'likes/123.md', properties: { 'like-of': [target] } };
const repost: Post = { ...like, type: 'repost', slug: '123-repost', date: '2025-07-11T00:49:38-04:00', properties: { 'repost-of': [target] } };
const note: Post = { type: 'note', date: '2025-07-10T10:00:00-04:00', slug: 'n', content: 'Hello', filePath: 'notes/n.md' };

test('rolled-up entries stand for every member type', () => {
	const entries = rollupIndexPosts([repost, like, note]);
	expect(entries.map(entryTypes)).toEqual([['like', 'repost'], ['note']]);
	expect(typeFilterOptions(entries.map(entryTypes))).toEqual([
		{ type: 'note', label: 'Notes', count: 1 },
		{ type: 'like', label: 'Likes', count: 1 },
		{ type: 'repost', label: 'Reposts', count: 1 }
	]);
});

test('types param accepts plural and singular names and ignores unknown ones', () => {
	expect([...parseTypesParam('notes,reply,bogus', available)]).toEqual(['note', 'reply']);
	expect([...parseTypesParam('notes+likes', available)]).toEqual(['note', 'like']);
	expect(parseTypesParam(null, available).size).toBe(0);
	expect(parseTypesParam('articles', available).size).toBe(0);
});

test('hrefs are canonical and fall back to the static feed', () => {
	expect(typesHref(['reply', 'note'], available)).toBe('/posts/filter?types=notes,replies');
	expect(typesHref(['note'], available, 3)).toBe('/posts/filter?types=notes&page=3');
	expect(typesHref(available, available)).toBe('/posts');
	expect(typesHref(available, available, 2)).toBe('/posts/page/2');
	expect(typesHref([], available)).toBe('/posts');
});

test('pills toggle one type, and switching off the last type shows everything', () => {
	const all = new Set(available);
	expect(toggleHref('like', all, available)).toBe('/posts/filter?types=notes,replies,reposts');
	expect(toggleHref('like', new Set<PostType>(['note']), available)).toBe('/posts/filter?types=notes,likes');
	expect(toggleHref('note', new Set<PostType>(['note']), available)).toBe('/posts');
});
