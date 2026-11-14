import { test, expect } from 'bun:test';
import { rollupIndexPosts, type Post } from '../src/lib/posts-types';
import { entryTypes, localTypesHref, parseTypesParam, toggleTypes, typeFilterOptions, typesHref, type PostType } from '../src/lib/posts-filter';

const available: PostType[] = ['note', 'reply', 'like', 'repost'];
const target = 'https://bsky.app/profile/did:plc:author/post/123';
const like: Post = { type: 'like', date: '2025-07-11T00:49:35-04:00', slug: '123', content: '', filePath: 'likes/123.md', properties: { 'like-of': [target] } };
const repost: Post = { ...like, type: 'repost', slug: '123-repost', date: '2025-07-11T00:49:38-04:00', properties: { 'repost-of': [target] } };
const note: Post = { type: 'note', date: '2025-07-10T10:00:00-04:00', slug: 'n', content: 'Hello', filePath: 'notes/n.md' };

test('rolled-up entries stand for every member type', () => {
	const entries = rollupIndexPosts([repost, like, note]);
	expect(entries.map(entryTypes)).toEqual([['like', 'repost'], ['note']]);
	expect(typeFilterOptions(entries.map(entryTypes))).toEqual([
		{ type: 'note', label: 'Notes', icon: '📝', count: 1 },
		{ type: 'like', label: 'Likes', icon: '♥', count: 1 },
		{ type: 'repost', label: 'Reposts', icon: '🔁', count: 1 }
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

test('pills start unselected and add types one at a time', () => {
	const all = new Set(available);
	expect(toggleTypes('like', all, available)).toEqual(['like']);
	expect(toggleTypes('note', new Set<PostType>(['like']), available)).toEqual(['note', 'like']);
	expect(toggleTypes('like', new Set<PostType>(['note', 'like']), available)).toEqual(['note']);
	expect(toggleTypes('note', new Set<PostType>(['note']), available)).toEqual(available);
	expect(typesHref(toggleTypes('like', all, available), available)).toBe('/posts/filter?types=likes');
});

test('archive pages filter in place with ?types=', () => {
	expect(localTypesHref('/2026/11', ['reply', 'note'], available)).toBe('/2026/11?types=notes,replies');
	expect(localTypesHref('/2026/11', available, available)).toBe('/2026/11');
});
