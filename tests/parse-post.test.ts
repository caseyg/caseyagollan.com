import { test } from 'bun:test';
import { strict as assert } from 'node:assert';
import { parsePost } from '../src/lib/server/parse-post';

test('parses Markdown without a Node Buffer global in the Worker', () => {
	const original = globalThis.Buffer;
	try {
		Object.defineProperty(globalThis, 'Buffer', { value: undefined, configurable: true, writable: true });
		const post = parsePost('---\ndate: "2026-11-06T23:30:00-05:00"\n---\nHello', 'notes', '2026-11-06-hello.md');
		assert.equal(post.date, '2026-11-06T23:30:00-05:00');
		assert.equal(post.content, 'Hello');
	} finally {
		globalThis.Buffer = original;
	}
});
