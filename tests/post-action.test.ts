import { describe, expect, test } from 'bun:test';
import { getPostAction, renderPostDetails } from '../src/lib/utils/post-details';
import type { Post } from '../src/lib/posts-types';

const base: Post = { slug: 's', type: 'note', date: '2026-01-10T12:00:00-05:00', content: '', filePath: '' };
const saved = {
	version: 1 as const, url: 'https://bsky.app/profile/example.com/post/abc', platform: 'bluesky' as const,
	author: { name: 'Example', handle: '@example.com', url: 'https://bsky.app/profile/example.com' },
	published: '2026-01-09T15:30:00-05:00', fetchedAt: '2026-01-10T12:00:00-05:00', html: '<p>Hello</p>', images: []
};

describe('getPostAction', () => {
	test('plain notes have no action', () => {
		expect(getPostAction(base)).toBeUndefined();
	});

	test('a reply names the saved author once', () => {
		expect(getPostAction({ ...base, type: 'reply', inReplyTo: saved.url, socialSnapshots: [saved] })).toEqual({
			verb: 'replied to', targets: [{ url: saved.url, label: '@example.com', classes: 'u-in-reply-to' }]
		});
	});

	test('a like without a saved post derives a handle or falls back to the host', () => {
		expect(getPostAction({ ...base, type: 'like', properties: { 'like-of': [saved.url] } })?.targets[0].label).toBe('@example.com');
		expect(getPostAction({ ...base, type: 'like', properties: { 'like-of': ['https://www.example.org/a/long/path'] } })).toEqual({
			verb: 'liked', targets: [{ url: 'https://www.example.org/a/long/path', label: 'example.org', classes: 'u-like-of' }]
		});
	});

	test('liking and reposting one post is a single action with both microformats', () => {
		expect(getPostAction({ ...base, type: 'like', properties: { 'like-of': [saved.url], 'repost-of': [saved.url] } })).toEqual({
			verb: 'liked and reposted', targets: [{ url: saved.url, label: '@example.com', classes: 'u-like-of u-repost-of' }]
		});
	});

	test('unsafe targets are ignored', () => {
		expect(getPostAction({ ...base, type: 'like', properties: { 'like-of': ['javascript:alert(1)'] } })).toBeUndefined();
	});
});

describe('renderPostDetails', () => {
	const like: Post = { ...base, type: 'like', properties: { 'like-of': [saved.url] }, socialSnapshots: [saved] };

	test('feeds keep the sentence; the site can omit it and keep the saved post', () => {
		expect(renderPostDetails(like)).toContain('Liked <a');
		const site = renderPostDetails(like, { omitReactionLabel: true });
		expect(site).not.toContain('Liked');
		expect(site).toContain('social-snapshot');
	});
});
