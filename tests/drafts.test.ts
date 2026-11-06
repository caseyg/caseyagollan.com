import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createPostReader } from '../src/lib/server/build-posts';
import { parsePost, PLURAL_TO_SINGULAR } from '../src/lib/server/parse-post';
import { getGitHubPost } from '../src/lib/server/github-posts';

const markdown = (draft?: boolean) => `---
date: 2026-11-06T23:30:00-05:00
${draft === undefined ? '' : `draft: ${draft}`}
category: draft-only-tag
---
Preview content
`;

describe('draft publication', () => {
	it('preserves draft status independently of visibility', () => {
		const post = parsePost(markdown(true).replace('category:', 'visibility: public\ncategory:'),
			'notes', '2026-11-06-preview.md');
		assert.equal(post.draft, true);
		assert.equal(post.visibility, 'public');
	});

	for (const cache of [true, false]) {
		it(`excludes drafts of every post type from the shared index and prerender data (cache=${cache})`, async () => {
			const files = Object.fromEntries(Object.keys(PLURAL_TO_SINGULAR).map(type => [
				`/content/${type}/2026-11-06-preview.md`, markdown(true)
			]));
			files['/content/notes/2026-11-06-published.md'] = markdown();
			files['/content/notes/2026-11-06-explicitly-published.md'] = markdown(false);
			const read = createPostReader(files, cache);
			for (let i = 0; i < 2; i++) {
				assert.deepEqual((await read()).map(p => p.slug).sort(), ['explicitly-published', 'published']);
			}
		});
	}

	it('sees draft-to-published and published-to-draft edits in development', async () => {
		const files = { '/content/notes/2026-11-06-preview.md': markdown(true) };
		const read = createPostReader(files, false);
		assert.equal((await read()).length, 0);
		files['/content/notes/2026-11-06-preview.md'] = markdown(false);
		assert.equal((await read()).length, 1);
		files['/content/notes/2026-11-06-preview.md'] = markdown(true);
		assert.equal((await read()).length, 0);
	});

	it('fetches an excluded draft at its exact permalink through the existing GitHub fallback', async () => {
		assert.deepEqual(await createPostReader({
			'/content/notes/2026-11-06-preview.md': markdown(true)
		}, true)(), []);
		const post = await getGitHubPost({ year: '2026', month: '11', day: '06', slug: 'preview' },
			(async (input, init) => {
				assert.equal(init?.cache, 'no-store');
				return new Response(markdown(true), {
					status: String(input).endsWith('/notes/2026-11-06-preview.md') ? 200 : 404
				});
			}) as typeof fetch);
		assert.ok(post);
		assert.equal(post.draft, true);
		assert.equal(post.slug, 'preview');
		assert.equal(post.content.trim(), 'Preview content');
	});
});
