import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createPostReader } from '../src/lib/server/build-posts';

const note = (text: string) => `---\ndate: 2026-11-06T23:30:00-05:00\n---\n${text}`;

describe('build-scoped post parsing', () => {
	it('reuses parsed posts across simultaneous build requests', async () => {
		const markdown = { '/content/notes/2026-11-06-example.md': note('Original') };
		const read = createPostReader(markdown, true);
		const [first, second] = await Promise.all([read(), read()]);
		assert.strictEqual(first, second);
		markdown['/content/notes/2026-11-06-example.md'] = note('Changed');
		assert.equal((await read())[0].content.trim(), 'Original');
	});

	it('sees content edits when caching is disabled', async () => {
		const markdown = { '/content/notes/2026-11-06-example.md': note('Original') };
		const read = createPostReader(markdown, false);
		assert.equal((await read())[0].content.trim(), 'Original');
		markdown['/content/notes/2026-11-06-example.md'] = note('Changed');
		assert.equal((await read())[0].content.trim(), 'Changed');
	});

	it('preserves dates and metadata, ignores unrelated folders, and sorts newest first', async () => {
		const read = createPostReader({
			'/content/notes/2025-09-01-older.md': '---\ndate: 2025-09-01T10:00:00Z\n---\nOlder',
			'/content/notes/2026-11-06-example.md': note('Newest'),
			'/content/unrelated/2026-11-06-ignore.md': note('Ignore')
		}, true);
		const posts = await read();
		assert.deepEqual(posts.map(p => [p.slug, p.type, p.date]), [
			['example', 'note', '2026-11-06T23:30:00-05:00'],
			['older', 'note', '2025-09-01T10:00:00Z']
		]);
	});
});
