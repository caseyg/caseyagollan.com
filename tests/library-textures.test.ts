import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { spineTextureSize } from '../src/lib/library/textures';

describe('library texture budget', () => {
	it('bounds spine allocations across the full collection', () => {
		const { nodes } = JSON.parse(readFileSync(new URL('../static/library/graph.json', import.meta.url), 'utf8'));
		let previousBytes = 0;
		let optimizedBytes = 0;
		for (const book of nodes.filter((node: { g: string }) => node.g === 'book')) {
			const depth = book.p ? Math.max(1, Math.ceil(book.p / 10)) : 20;
			const width = Math.max(depth / 10, 0.5);
			const height = book.z / 10 || 25;
			const size = spineTextureSize(width, height);
			assert.ok(size.width >= 16 && size.width <= 128);
			assert.ok(size.height >= 16 && size.height <= 512);
			previousBytes += Math.round(width * 80) * Math.round(height * 80) * 4;
			optimizedBytes += size.width * size.height * 4;
		}
		assert.ok(optimizedBytes < previousBytes * 0.1, 'reduce spine pixel allocations by at least 90%');
	});

	it('preserves aspect ratio within the minimum readable width', () => {
		const size = spineTextureSize(2, 25);
		assert.equal(size.height, 512);
		assert.ok(Math.abs(size.width / size.height - 2 / 25) < 0.002);
		assert.deepEqual(spineTextureSize(0.5, 100), { width: 16, height: 512 });
	});
});
