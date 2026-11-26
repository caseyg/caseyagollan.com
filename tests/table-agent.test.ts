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
		expect(isOwnerTool('table_new')).toBe(true);
		expect(isOwnerTool('micropub_create_post')).toBe(true);
		expect(isOwnerTool('table_read')).toBe(false);
		expect(isOwnerTool('show_page')).toBe(false);
		expect(isOwnerTool('go_to')).toBe(false);
		expect(isTableTool('table_read')).toBe(true);
		expect(isTableTool('table_new')).toBe(false);
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

describe('table chat pictures', () => {
	test('table_look shows its snapshot; view_image shows the address, not the bytes', () => {
		const entries = [
			{ id: 'e1', kind: 'chat.say', data: { id: 's1', author: { id: 'c', name: 'Casey', via: 'owner' }, owner: true, at: 1, text: 'Tidy this up' } },
			{ id: 'e2', kind: 'message', model: [{ role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'table_look', arguments: {} }, { type: 'toolCall', id: 'c2', name: 'view_image', arguments: { url: 'https://files.caseyagollan.com/a.jpg' } }], timestamp: 2 }] },
			{ id: 'e3', kind: 'message', model: [{ role: 'toolResult', toolCallId: 'c1', toolName: 'table_look', isError: false, content: [{ type: 'text', text: 'The table' }, { type: 'image', mimeType: 'image/jpeg', data: 'AAAA' }] }] },
			{ id: 'e4', kind: 'message', model: [{ role: 'toolResult', toolCallId: 'c2', toolName: 'view_image', isError: false, content: [{ type: 'text', text: 'The picture at https://files.caseyagollan.com/a.jpg:' }, { type: 'image', mimeType: 'image/jpeg', data: 'BBBB' }] }] }
		];
		const [, reply] = projectMessages(entries as never, {}, 3);
		expect(reply.tools?.[0]).toMatchObject({ tool: 'table_look', label: 'Looked at the table', picture: { src: 'data:image/jpeg;base64,AAAA' } });
		expect(reply.tools?.[1]).toMatchObject({ tool: 'view_image', picture: { src: 'https://files.caseyagollan.com/a.jpg' } });
	});

	test('table_look is Casey’s, view_image anyone’s', () => {
		expect(isOwnerTool('table_look')).toBe(true);
		expect(isOwnerTool('table_add')).toBe(true);
		expect(isOwnerTool('view_image')).toBe(false);
		expect(toolLabel('table_arrange', { layout: 'columns' })).toBe('Arranged the table in columns');
	});

	test('steps of the newer tools read plainly', () => {
		expect(toolLabel('search_site', { query: 'calm technology' })).toBe('Searched the site for “calm technology”');
		expect(toolLabel('search_site', { days: 7 })).toBe('Looked through posts from the last 7 days');
		expect(toolLabel('search_site', { type: 'note' })).toBe('Looked through the newest notes');
		expect(toolLabel('search_site', { type: 'like', since: '2026-10-01' })).toBe('Looked through likes since 2026-10-01');
		expect(toolLabel('fetch_page', {})).toBe('Read this page');
		expect(toolLabel('micropub_list_posts', { drafts_only: true })).toBe('Looked for drafts');
		expect(toolLabel('table_new', { name: 'Calm tech' })).toBe('Made a table, “Calm tech”');
		expect(toolLabel('table_add', { items: [{ note: 'a' }, { text: 'b' }, { url: '/x' }, { search: 'oliveros' }] })).toBe('Added 2 notes, 1 link and results for “oliveros”');
		expect(toolLabel('table_arrange', { layout: 'tidy' })).toBe('Tidied the table');
		expect(toolLabel('table_arrange', { layout: 'auto' })).toBe('Tidied up the table');
		expect(toolLabel('table_arrange', { layout: 'tree', ids: ['selected'] })).toBe('Arranged the selected items as a tree');
		expect(toolLabel('table_arrange', { layout: 'cluster', inside: 'f1' })).toBe('Arranged a frame into groups');
		expect(toolLabel('table_arrange', { align: 'left', ids: ['a', 'b'] })).toBe('Lined up 2 items');
		expect(toolLabel('table_group', { ids: ['a', 'b'], name: 'Sources' })).toBe('Framed 2 items as “Sources”');
		expect(toolLabel('table_edit', { edits: [{ id: 'a', text: 'x' }], remove: ['b', 'c'] })).toBe('Edited 1 item, removed 2 items');
		expect(toolLabel('table_edit', { rename: 'Listening' })).toBe('Renamed the table “Listening”');
	});
});

describe('table chat drawing', () => {
	test('a saved table’s arrows name the items they join; framed items name their frame', () => {
		const document = {
			schema: {},
			store: {
				'shape:f': { typeName: 'shape', id: 'shape:f', type: 'frame', parentId: 'page:1', x: 0, y: 0, props: { w: 600, h: 400, name: 'Deep listening' } },
				'shape:a': { typeName: 'shape', id: 'shape:a', type: 'note', parentId: 'shape:f', x: 40, y: 40, props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cistern' }] }] } } },
				'shape:arrow': { typeName: 'shape', id: 'shape:arrow', type: 'arrow', parentId: 'page:1', x: 0, y: 500, props: {} },
				'binding:1': { typeName: 'binding', id: 'binding:1', type: 'arrow', fromId: 'shape:arrow', toId: 'shape:a', props: { terminal: 'start' } },
				'binding:2': { typeName: 'binding', id: 'binding:2', type: 'arrow', fromId: 'shape:arrow', toId: 'shape:f', props: { terminal: 'end' } }
			}
		};
		const items = itemsFromDocument(document);
		expect(items.find((item) => item.id === 'f')).toMatchObject({ type: 'frame', text: 'Deep listening' });
		expect(items.find((item) => item.id === 'a')).toMatchObject({ parent: 'f' });
		expect(items.find((item) => item.id === 'arrow')).toMatchObject({ from: 'a', to: 'f' });
	});

	test('drawing steps read plainly', () => {
		expect(toolLabel('table_connect', { links: [{}, {}] })).toBe('Drew 2 arrows');
		expect(toolLabel('table_draw', { strokes: [{ around: 'x' }] })).toBe('Circled something');
		expect(toolLabel('table_frame', { name: 'Sources', ids: ['a', 'b'] })).toBe('Framed 2 items as “Sources”');
		expect(isOwnerTool('table_connect')).toBe(true);
	});
});

describe('links the chat adds', () => {
	const post = { kind: 'post' as const, url: '/2026/11/24/paperwork/', title: 'Commission on Federal Paperwork', meta: 'repost · 2026-11-24', image: '/media/paperwork.jpg', icon: '🔁' };
	const search = async (words: string) => words.includes('Paperwork') ? [{ kind: 'post' as const, url: '/2026/11/20/other/', title: 'Other' }, post] : [];

	test('a page on this site becomes the rich block its search finds', async () => {
		const { linkedBlock } = await import('../src/lib/table-sources');
		expect(await linkedBlock('https://caseyagollan.com/2026/11/24/paperwork', ['Nope', 'Commission on Federal Paperwork'], undefined, search)).toEqual(post);
	});

	test('anything else stays a plain link', async () => {
		const { linkedBlock } = await import('../src/lib/table-sources');
		expect(await linkedBlock('https://caseyagollan.com/2026/11/24/missing/', ['Paperwork'], undefined, search)).toMatchObject({ kind: 'link', url: '/2026/11/24/missing/' });
		expect(await linkedBlock('https://example.com/a', ['Paperwork'], undefined, search)).toMatchObject({ kind: 'link', url: 'https://example.com/a' });
	});
});
