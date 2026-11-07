import { describe, test } from 'bun:test';
import { strict as assert } from 'node:assert';
import { getGitHubPost } from '../src/lib/server/github-posts';

const markdown = `---
date: 2026-11-06T23:30:00-05:00
title: Fresh post
photo:
  - url: https://example.com/photo.jpg
    alt: A photo
category:
  - updates
---
Hello **world**.
`;
const params = { year: '2026', month: '11', day: '06', slug: 'fresh-post' };

function githubFetch(status = 200, body = markdown): typeof fetch {
	return (async (input: RequestInfo | URL) => {
		const url = new URL(String(input));
		return url.pathname.endsWith('/notes/2026-11-06-fresh-post.md')
			? new Response(body, { status }) : new Response('', { status: 404 });
	}) as typeof fetch;
}

describe('GitHub permalink fallback', () => {
	test('can read the same isolated branch selected for publishing', async () => {
		let requested = '';
		const post = await getGitHubPost(params, (async input => {
			requested = String(input);
			return new Response(markdown);
		}) as typeof fetch, 'preview-token', { owner: 'caseyg', repo: 'preview-content', branch: 'preview/test' });
		assert.ok(post);
		assert.ok(requested.includes('/repos/caseyg/preview-content/contents/'));
		assert.ok(requested.endsWith('?ref=preview%2Ftest'));
	});

	test('renders newly committed Markdown with local date, metadata and media intact', async () => {
		const post = await getGitHubPost(params, githubFetch());
		assert.ok(post);
		assert.equal(post.slug, 'fresh-post');
		assert.equal(post.type, 'note');
		assert.equal(post.date, '2026-11-06T23:30:00-05:00');
		assert.equal(post.title, 'Fresh post');
		assert.deepEqual(post.category, ['updates']);
		assert.deepEqual(post.photo?.map(({ url, alt }) => ({ url, alt })), [
			{ url: 'https://example.com/photo.jpg', alt: 'A photo' }
		]);
		assert.equal(post.filePath, 'notes/2026-11-06-fresh-post.md');
		assert.equal(post.content.trim(), 'Hello **world**.');
	});
	test('searches other post types', async () => {
		const post = await getGitHubPost(params, (async input => new Response(markdown, {
			status: String(input).includes('/articles/') ? 200 : 404
		})) as typeof fetch);
		assert.equal(post?.type, 'article');
	});
	test('finds UTC-dated filenames at the local-date permalink', async () => {
		const post = await getGitHubPost(params, (async input => new Response(markdown, {
			status: String(input).endsWith('/notes/2026-11-07-fresh-post.md') ? 200 : 404
		})) as typeof fetch);
		assert.equal(post?.date, '2026-11-06T23:30:00-05:00');
		assert.equal(post?.filePath, 'notes/2026-11-07-fresh-post.md');
	});
	test('returns null only when every candidate is absent', async () => {
		assert.equal(await getGitHubPost(params, githubFetch(404)), null);
	});
	test('rejects traversal and impossible dates before fetching', async () => {
		const noFetch = (async (_input: RequestInfo | URL): Promise<Response> => { throw new Error('Must not fetch'); }) as typeof fetch;
		for (const invalid of [
			{ ...params, slug: '../secret' },
			{ ...params, slug: 'a/b' },
			{ ...params, day: '31', month: '02' }
		]) {
			assert.equal(await getGitHubPost(invalid, noFetch), null);
		}
	});
	test('does not render a post under the wrong date', async () => {
		assert.equal(await getGitHubPost(params,
			githubFetch(200, markdown.replace('2026-11-06T', '2026-11-05T'))), null);
	});
	test('keeps upstream errors distinct from missing posts', async () => {
		await assert.rejects(getGitHubPost(params, githubFetch(403, 'Rate limited')));
	});
	test('does not cache GitHub responses', async () => {
		let cache: RequestCache | undefined;
		await getGitHubPost(params, (async (_input, init) => {
			cache = init?.cache;
			return new Response('', { status: 404 });
		}) as typeof fetch);
		assert.equal(cache, 'no-store');
	});
});
