import { expect, test } from 'bun:test';
import { load } from '../src/routes/library/[[isbn]]/+page.server';
import catalog from '../static/library/graph.json';

async function loadBook(path: string, isbn?: string) {
	return await load({ params: { isbn }, url: new URL(path, 'https://example.com'), platform: { env: {} } } as Parameters<typeof load>[0]);
}

test('production deep links include catalog details without the full graph', async () => {
	const data = await loadBook('/library/0907259235', '0907259235');
	expect(data?.initialBook?.isbn).toBe('0907259235');
	expect(data?.initialBook?.id).toBeTruthy();
	expect(data?.initialBook?.authorName).toBeTruthy();
	expect(data?.graphData).toBeNull();
});

test('books without an ISBN also have initial details through their book ID', async () => {
	const book = catalog.nodes.find((node) => node.g === 'book' && !node.n && node.b)!;
	const data = await loadBook(`/library/?book=${book.b}`);
	expect(data?.initialBook?.bookid).toBe(book.b);
});

test('index and unknown book links do not select an arbitrary book', async () => {
	for (const path of ['/library/', '/library/?book=unknown']) {
		expect((await loadBook(path))?.initialBook).toBeNull();
	}
	expect((await loadBook('/library/unknown', 'unknown'))?.initialBook).toBeNull();
});
