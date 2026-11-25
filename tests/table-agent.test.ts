import { describe, expect, test } from 'bun:test';
import { itemsFromDocument, tableThreadId } from '../src/lib/table-agent';
import { CHAT_ID } from '../src/lib/chat';
import { peekFrom, projectMessages, toolLabel } from '../src/lib/server/chat/projection';
import { isOwnerTool, isTableTool, sitePath } from '../src/lib/server/chat/tools';

describe('table chat', () => {
	test('each table has one thread id, a valid chat id', () => {
		expect(tableThreadId('cooperatives')).toBe(tableThreadId('cooperatives'));
		expect(tableThreadId('cooperatives')).not.toBe(tableThreadId('cooperative'));
		for (const id of ['a', 'abcd', 'my-long-table-name-2026']) expect(CHAT_ID.test(tableThreadId(id))).toBe(true);
	});

	test('reads a saved document: blocks, notes, in reading order', () => {
		const document = {
			schema: {},
			store: {
				'shape:b': { typeName: 'shape', id: 'shape:b', type: 'site-block', x: 240, y: 0, props: { kind: 'post', title: 'Second', url: '/2026/b/', w: 200, h: 120, excerpt: 'Two' } },
				'shape:a': { typeName: 'shape', id: 'shape:a', type: 'site-block', x: 0, y: 0, props: { kind: 'book', title: 'First', url: '/library/a', w: 200, h: 120 } },
				'shape:n': { typeName: 'shape', id: 'shape:n', type: 'note', x: 0, y: 200, props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remember' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'this' }] }] } } },
				'page:1': { typeName: 'page', id: 'page:1' }
			}
		};
		expect(itemsFromDocument(document)).toEqual([
			{ id: 'a', type: 'book', title: 'First', url: '/library/a', x: 0, y: 0, w: 200, h: 120 },
			{ id: 'b', type: 'post', title: 'Second', url: '/2026/b/', text: 'Two', x: 240, y: 0, w: 200, h: 120 },
			{ id: 'n', type: 'note', text: 'Remember\nthis', x: 0, y: 200, w: 200, h: 200 }
		]);
		expect(itemsFromDocument(null)).toEqual([]);
	});

	test('only Casey changes tables; table tools only in table threads', () => {
		expect(isOwnerTool('table_arrange')).toBe(true);
		expect(isOwnerTool('create_table')).toBe(true);
		expect(isOwnerTool('micropub_create_post')).toBe(true);
		expect(isOwnerTool('table_read')).toBe(false);
		expect(isOwnerTool('show_page')).toBe(false);
		expect(isOwnerTool('go_to')).toBe(false);
		expect(isTableTool('table_read')).toBe(true);
		expect(isTableTool('create_table')).toBe(false);
	});

	test('go_to stays on this site', () => {
		const origin = 'https://caseyagollan.com/';
		expect(sitePath('/library', origin)).toBe('/library');
		expect(sitePath('https://caseyagollan.com/tables/abcd?x=1', origin)).toBe('/tables/abcd?x=1');
		expect(sitePath('https://www.caseyagollan.com/wiki', 'https://preview.workers.dev/')).toBe('/wiki');
		expect(sitePath('https://evil.example/', origin)).toBeNull();
		expect(sitePath('javascript:alert(1)', origin)).toBeNull();
		expect(sitePath('//evil.example/x', origin)).toBeNull();
	});

	test('a shown page becomes a card in the reply', () => {
		const entries = [
			{ id: 'e1', kind: 'chat.say', data: { id: 's1', author: { id: 'x', name: 'Ana', via: 'mastodon' }, owner: false, at: 1, text: 'Show me the library' } },
			{ id: 'e2', kind: 'message', model: [{ role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'show_page', arguments: { url: '/library' } }], timestamp: 2 }] },
			{ id: 'e3', kind: 'message', model: [{ role: 'toolResult', toolCallId: 'c1', toolName: 'show_page', isError: false, content: [{ type: 'text', text: JSON.stringify({ url: 'https://caseyagollan.com/library', title: 'Library', excerpt: 'Books Casey is reading.' }) }] }] }
		];
		const [, reply] = projectMessages(entries as never, {}, 3);
		expect(reply.tools?.[0]).toEqual({ tool: 'show_page', label: 'Showed Library', status: 'done', peek: { url: 'https://caseyagollan.com/library', title: 'Library', excerpt: 'Books Casey is reading.' } });
		expect(peekFrom('{"url":"javascript:x","title":"x"}')).toBeUndefined();
		expect(peekFrom('not json')).toBeUndefined();
	});

	test('table steps read plainly', () => {
		expect(toolLabel('table_arrange', { layout: 'grid' })).toBe('Arranged the table in a grid');
		expect(toolLabel('table_arrange', { layout: 'pack', ids: ['a', 'b'] })).toBe('Arranged 2 items packed together');
		expect(toolLabel('table_remove', { ids: ['a'] })).toBe('Removed 1 item');
		expect(toolLabel('go_to', { path: '/library' })).toBe('Took you to /library');
	});
});

describe('chat is owner-only for now', () => {
	test('the nav and palette show Chat only to the owner', async () => {
		const { visibleSections } = await import('../src/lib/site-sections');
		expect(visibleSections(false).some((section) => section.id === 'chat')).toBe(false);
		expect(visibleSections(true).some((section) => section.id === 'chat')).toBe(true);
		expect(visibleSections(false).map((section) => section.id)).toEqual(['home', 'library', 'posts', 'wiki', 'tables']);
	});
});
