import { describe, expect, test } from 'bun:test';
import { pickPlace, savedAll, savedItem, savedList, savedPlaces, SavesError, type SavesDeps } from '../src/lib/server/saves';
import { arenaAddress, chatExtension, isOwnerTool, savesListing } from '../src/lib/server/chat/tools';

/** Are.na, Raindrop and Readwise, answered from a few fixtures; `asked` records every address and its credentials. */
function services() {
	const asked: { url: string; auth: string | null }[] = [];
	const block = (id: number, title: string, extra: Record<string, unknown> = {}) => ({ id, type: 'Link', title, visibility: 'public', created_at: '2026-01-02T00:00:00Z', source: { url: `https://example.com/${id}`, provider: { name: 'example.com' } }, user: { slug: 'casey-gollan' }, ...extra });
	const calm = Array.from({ length: 45 }, (_, n) => block(100 + n, n === 3 ? 'Mark Weiser on calm computing' : `Calm thing ${n}`, n === 5 ? { visibility: 'private' } : {}));
	const channels = [
		{ id: 1, type: 'Channel', slug: 'calm-technology-research', title: 'Calm Technology Research', visibility: 'public', counts: { contents: 45 }, owner: { slug: 'casey-gollan' }, updated_at: '2026-11-25T00:00:00Z' },
		{ id: 2, type: 'Channel', slug: 'index-of-calm-technologies', title: 'Index of Calm Technologies', visibility: 'public', counts: { contents: 2 }, owner: { slug: 'casey-gollan' } },
		{ id: 3, type: 'Channel', slug: 'secret-plans', title: 'Secret plans', visibility: 'private', counts: { contents: 1 }, owner: { slug: 'casey-gollan' } }
	];
	const drops = Array.from({ length: 60 }, (_, n) => ({ _id: 900 + n, title: `Bookmark ${n}`, link: `https://site.test/${n}`, excerpt: n === 0 ? 'About tools for thought' : '', created: '2026-03-04T00:00:00Z', type: 'link', tags: ['saved'] }));
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		asked.push({ url: url.href, auth: new Headers(init?.headers).get('authorization') });
		const page = Number(url.searchParams.get('page') ?? 1), per = Number(url.searchParams.get('per') ?? url.searchParams.get('perpage') ?? 100);
		if (url.host === 'api.are.na') {
			if (url.pathname === '/v3/users/casey-gollan/contents') return Response.json({ data: channels, meta: { has_more_pages: false } });
			if (url.pathname === '/v3/channels/calm') return Response.json({ id: 9, type: 'Channel', slug: 'calm', title: 'calm', owner: { slug: 'someone-else' } });
			const channel = /^\/v3\/channels\/([^/]+)(\/contents)?$/.exec(url.pathname);
			if (channel) {
				const found = channels.find((one) => one.slug === channel[1]);
				if (!found) return new Response('{}', { status: 404 });
				if (!channel[2]) return Response.json(found);
				const all = found.id === 1 ? calm : found.id === 2 ? [block(1, 'Dangling String'), { ...channels[0] }] : [block(7, 'A plan', { visibility: 'private' })];
				const data = all.slice((page - 1) * per, page * per);
				return Response.json({ data, meta: { total_count: all.length, has_more_pages: page * per < all.length } });
			}
			if (url.pathname === '/v3/blocks/103') return Response.json(block(103, 'Mark Weiser on calm computing', { type: 'Text', content: { plain: 'The most profound technologies are those that disappear.' } }));
			if (url.pathname === '/v3/blocks/103/connections') return Response.json({ data: [channels[0]], meta: {} });
		}
		if (url.host === 'api.raindrop.io') {
			if (url.pathname === '/rest/v1/collections') return Response.json({ items: [{ _id: 11, title: 'Design', count: 60 }] });
			if (url.pathname === '/rest/v1/collections/childrens') return Response.json({ items: [{ _id: 12, title: 'Type', count: 3, parent: { $id: 11 } }] });
			const list = /^\/rest\/v1\/raindrops\/(-?\d+)$/.exec(url.pathname);
			if (list) {
				const search = url.searchParams.get('search');
				const all = search ? drops.filter((drop) => `${drop.title} ${drop.excerpt}`.toLowerCase().includes(search.toLowerCase())) : drops;
				return Response.json({ items: all.slice(page * per, (page + 1) * per), count: all.length });
			}
			if (url.pathname === '/rest/v1/raindrop/900') return Response.json({ item: { ...drops[0], note: 'Read this again', highlights: [{ text: 'A highlighted line' }] } });
		}
		if (url.host === 'readwise.io') {
			if (url.pathname === '/api/v3/tags/') return Response.json({ results: [{ key: 'ai', name: 'AI' }] });
			if (url.pathname === '/api/v3/list/') {
				if (url.searchParams.get('id')) return Response.json({ results: [{ id: url.searchParams.get('id'), title: 'A long read', source_url: 'https://long.test/read', category: 'article', location: 'later', html_content: `<p>${'word '.repeat(3000)}</p>`, tags: { ai: {} } }] });
				return Response.json({ count: 2, nextPageCursor: null, results: [{ id: '01aaaaaaaaaaaaaaaaaaaaaaaa', title: 'Saved for later', source_url: 'https://later.test/a', category: 'article', saved_at: '2026-05-06T00:00:00Z', summary: 'A summary', parent_id: null }, { id: '01bbbbbbbbbbbbbbbbbbbbbbbb', category: 'highlight', parent_id: '01aaaaaaaaaaaaaaaaaaaaaaaa' }] });
			}
			if (url.pathname === '/api/v2/books/') return Response.json({ count: 2, next: null, results: [{ id: 5, title: 'Living With Complexity', author: 'Donald A. Norman', category: 'books', num_highlights: 2, source_url: null }, { id: 6, title: 'Unread', category: 'books', num_highlights: 0 }] });
			if (url.pathname === '/api/v2/highlights/') return Response.json({ count: 2, next: null, results: [{ id: 51, text: 'Taming technology is a psychological task.', note: 'yes' }, { id: 52, text: 'Complexity is good; confusion is bad.' }] });
			if (url.pathname === '/api/mcp/highlights') return Response.json({ results: [{ id: 51, attributes: { document_title: 'Living With Complexity', document_author: 'Donald A. Norman', highlight_plaintext: 'Taming technology is a psychological task.' } }] });
		}
		return new Response('{}', { status: 404 });
	}) as typeof fetch;
	const deps: SavesDeps = { env: { ARENA_PAT: 'arena-secret', RAINDROP_TOKEN: 'raindrop-secret', READWISE_ACCESS_TOKEN: 'readwise-secret' }, fetcher };
	return { deps, asked, fetcher };
}

describe('Casey’s saves, read in full', () => {
	test('lists Are.na channels, private ones marked', async () => {
		const { deps, asked } = services();
		const places = await savedPlaces(deps, 'arena');
		expect(places.map((place) => place.in)).toEqual(['calm-technology-research', 'index-of-calm-technologies', 'secret-plans']);
		expect(places[2]).toMatchObject({ title: 'Secret plans', private: true });
		expect(asked[0]).toMatchObject({ auth: 'Bearer arena-secret' });
	});

	test('lists a channel by its title, a page at a time', async () => {
		const { deps } = services();
		const first = await savedList(deps, 'arena', { in: 'Calm Technology Research' });
		expect(first.place).toMatchObject({ in: 'calm-technology-research', title: 'Calm Technology Research' });
		expect(first.items).toHaveLength(40);
		expect(first).toMatchObject({ total: 45, more: '2' });
		const second = await savedList(deps, 'arena', { in: 'calm-technology-research', after: first.more });
		expect(second.items).toHaveLength(5);
		expect(second.more).toBeUndefined();
	});

	test('a private block is marked, and its table block says so', async () => {
		const { deps } = services();
		const hidden = (await savedList(deps, 'arena', { in: 'calm-technology-research' })).items[5];
		expect(hidden.private).toBe(true);
		expect(hidden.block?.meta).toStartWith('Private');
	});

	test('a bare word names one of Casey’s channels, never someone else’s with that slug', async () => {
		const { deps } = services();
		await expect(savedList(deps, 'arena', { in: 'calm' })).rejects.toThrow(/Several channels match “calm”.*Calm Technology Research.*Index of Calm Technologies/s);
		expect((await savedList(deps, 'arena', { in: 'index of calm' })).place?.in).toBe('index-of-calm-technologies');
	});

	test('searches within a channel, and reads all of one', async () => {
		const { deps } = services();
		const found = await savedList(deps, 'arena', { in: 'calm-technology-research', query: 'weiser' });
		expect(found.items.map((item) => item.id)).toEqual(['103']);
		const all = await savedAll(deps, 'arena', { in: 'calm-technology-research' });
		expect(all.items).toHaveLength(45);
		// A channel inside a channel is a block that opens it, under its owner.
		const nested = (await savedAll(deps, 'arena', { in: 'index-of-calm-technologies' })).items[1];
		expect(nested).toMatchObject({ kind: 'channel', url: 'https://www.are.na/casey-gollan/calm-technology-research' });
	});

	test('reads one block in full, with the channels it is in', async () => {
		const { deps } = services();
		expect(await savedItem(deps, 'arena', 'https://www.are.na/block/103')).toMatchObject({ content: 'The most profound technologies are those that disappear.', channels: [{ in: 'calm-technology-research' }] });
	});

	test('Raindrop: collections with their parents, a collection’s pages, search, one bookmark', async () => {
		const { deps, asked } = services();
		expect((await savedPlaces(deps, 'raindrop')).map((place) => place.title)).toEqual(['Design', 'Design / Type', 'Unsorted', 'All bookmarks']);
		const first = await savedList(deps, 'raindrop', { in: 'Design' });
		expect(first).toMatchObject({ total: 60, more: '1' });
		expect(first.items[0].block).toMatchObject({ kind: 'raindrop', url: 'https://site.test/0' });
		expect((await savedList(deps, 'raindrop', { in: 'design', after: '1' })).more).toBeUndefined();
		expect((await savedList(deps, 'raindrop', { query: 'tools for thought' })).items.map((item) => item.id)).toEqual(['900']);
		expect(await savedItem(deps, 'raindrop', '900')).toMatchObject({ note: 'Read this again', highlights: [{ text: 'A highlighted line' }] });
		expect((await savedAll(deps, 'raindrop', { in: 'all' })).items).toHaveLength(60);
		expect(asked.filter((one) => one.url.includes('raindrop.io')).every((one) => one.auth === 'Bearer raindrop-secret')).toBe(true);
	});

	test('Readwise: shelves and tags, a shelf without its highlights, a book’s highlights, search, a document', async () => {
		const { deps } = services();
		expect((await savedPlaces(deps, 'readwise')).map((place) => place.in)).toEqual(['inbox', 'later', 'shortlist', 'archive', 'feed', 'highlights', 'highlights:books', 'highlights:articles', 'highlights:tweets', 'highlights:podcasts', 'highlights:supplementals', 'tag:ai']);
		const later = await savedList(deps, 'readwise', { in: 'later' });
		expect(later.items.map((item) => item.title)).toEqual(['Saved for later']);
		expect(later.items[0].block).toMatchObject({ kind: 'link', url: 'https://later.test/a' });
		expect((await savedList(deps, 'readwise', { in: 'highlights' })).items.map((item) => item.title)).toEqual(['Living With Complexity']);
		const book = await savedList(deps, 'readwise', { in: 'living with complexity' });
		expect(book.items.map((item) => item.text)).toEqual(['Taming technology is a psychological task. (Casey’s note: yes)', 'Complexity is good; confusion is bad.']);
		expect(book.items[0].block).toMatchObject({ kind: 'quote', title: 'Living With Complexity', excerpt: 'Taming technology is a psychological task.' });
		expect((await savedList(deps, 'readwise', { query: 'taming' })).items[0]).toMatchObject({ kind: 'highlight', title: 'Living With Complexity' });
		const read = await savedItem(deps, 'readwise', '01aaaaaaaaaaaaaaaaaaaaaaaa') as { content: string; more: string };
		expect(read.content).toHaveLength(8000);
		expect(read.more).toContain('from=8000');
	});

	test('without a token a source says it isn’t connected, and names no secret', async () => {
		const { fetcher } = services();
		await expect(savedPlaces({ env: {}, fetcher }, 'raindrop')).rejects.toThrow(SavesError);
		await expect(savedList({ env: {}, fetcher }, 'readwise', { in: 'later' })).rejects.toThrow(/isn’t connected/);
	});

	test('pickPlace takes an exact title over a longer one', () => {
		const places = [{ in: 'a', title: 'Calm' }, { in: 'b', title: 'Calm Technology' }];
		expect(pickPlace(places, 'calm', 'channel').in).toBe('a');
		expect(() => pickPlace(places, 'loud', 'channel')).toThrow(/No channel matches/);
	});

	test('a listing fits the model’s context however long the items are', async () => {
		const { deps } = services();
		const page = await savedList(deps, 'arena', { in: 'calm-technology-research' });
		for (const item of page.items) item.text = 'word '.repeat(2000);
		const listing = savesListing('arena', page);
		expect(JSON.stringify(listing).length).toBeLessThan(14_000);
		expect(listing).toMatchObject({ source: 'Are.na', total: 45, showing: 40, more: '2' });
	});
});

describe('my_saves and table_add in the chat', () => {
	const out = async (tool: { execute: (...args: never[]) => unknown }, args: unknown) => ((await (tool.execute as (args: unknown, api: unknown, context: unknown) => Promise<{ output: { text: string }[] }>)(args, {}, {})).output[0].text);
	const assets = { fetch: async () => Response.json([]) } as unknown as Fetcher;

	function setup(start: { id: string; type: string; url?: string; x: number; y: number; w: number; h: number }[] = [], owner = true) {
		const { deps, fetcher } = services();
		const ops: { op: string; blocks?: { url: string; title: string; kind: string }[]; at?: { x: number; y: number }; columns?: number; name?: string; ids?: string[] }[] = [];
		const items = [...start];
		let made = 0;
		const thread = {
			table: () => 'table1',
			tableOp: async (op: (typeof ops)[number]) => {
				ops.push(op);
				if (op.op === 'read') return { items };
				if (op.op === 'add_blocks') return { added: op.blocks!.map((block, index) => { const id = `b${++made}`; items.push({ id, type: block.kind, url: block.url, x: op.at!.x + (index % op.columns!) * 260, y: op.at!.y + Math.floor(index / op.columns!) * 260, w: 240, h: 240 }); return id; }) };
				if (op.op === 'frame') {
					const inside = items.filter((item) => op.ids!.includes(item.id));
					const x = Math.min(...inside.map((item) => item.x)) - 40, y = Math.min(...inside.map((item) => item.y)) - 40;
					const id = `f${++made}`;
					items.push({ id, type: 'frame', x, y, w: Math.max(...inside.map((item) => item.x + item.w)) + 40 - x, h: Math.max(...inside.map((item) => item.y + item.h)) + 40 - y });
					return { added: [id], holds: op.ids };
				}
				return { layout: 'no overlaps' };
			},
			readTable: async () => ({ items }),
			createTable: async () => ({ id: 'new123', url: '/tables/new123' }),
			navigate: async () => true,
			tableOpened: async () => true
		};
		const extension = chatExtension({ env: { ...deps.env, ASSETS: assets } as never, origin: () => 'https://caseyagollan.com/', thread, savesFetch: fetcher, onlyOwner: () => owner });
		return { extension, tool: (name: string) => extension.tools!.find((one) => one.name === name)!, ops, items };
	}

	test('my_saves is Casey’s alone: withheld from other runs, and refused if called', async () => {
		expect(isOwnerTool('my_saves')).toBe(true);
		const { extension } = setup([], false);
		const hooks = extension.hooks as unknown as { handlers: { beforeTool?: (call: unknown, api: unknown, context: unknown) => Promise<{ block?: string } | undefined>; beforeProviderRequest?: (request: unknown, api: unknown, context: unknown) => Promise<{ payload: { tools?: { function: { name: string } }[] } } | undefined> } }[];
		const api = { conversationId: 'c', snapshot: async () => ({ run: { turns: 0, first: 'e1' } }), entries: async () => ({ items: [{ kind: 'chat.say', data: { owner: false } }] }) };
		const tools = extension.tools!.map((tool) => ({ type: 'function', function: { name: tool.name } }));
		let sent: string[] = [];
		for (const hook of hooks) { const changed = await hook.handlers.beforeProviderRequest?.({ payload: { tools, messages: [] } }, api, {}); if (changed) sent = (changed.payload.tools ?? []).map((tool) => tool.function.name); }
		expect(sent).toContain('search_site');
		expect(sent).not.toContain('my_saves');
		const verdicts = await Promise.all(hooks.map((hook) => hook.handlers.beforeTool?.({ name: 'my_saves', arguments: { source: 'arena' } }, api, {})));
		expect(verdicts.some((verdict) => verdict?.block?.includes('Only Casey'))).toBe(true);
		// And the prompt doesn't mention it to anyone else.
		expect(await extension.sections!.find((section) => section.key === 'saves')!.render({} as never, {} as never)).toBeUndefined();
	});

	test('my_saves lists places, a place, and one item', async () => {
		const { tool } = setup();
		expect(JSON.parse(await out(tool('my_saves'), { source: 'arena' })).places).toHaveLength(3);
		const channel = JSON.parse(await out(tool('my_saves'), { source: 'Are.na', in: 'Calm Technology Research' }));
		expect(channel).toMatchObject({ in: 'calm-technology-research', total: 45, showing: 40, more: '2' });
		expect(channel.items[0]).toMatchObject({ id: '100', title: 'Calm thing 0', kind: 'link', url: 'https://www.are.na/block/100' });
		expect(JSON.parse(await out(tool('my_saves'), { source: 'raindrop', item: '900' }))).toMatchObject({ source: 'Raindrop', note: 'Read this again' });
		await expect(out(tool('my_saves'), { source: 'arena', in: 'no such channel' })).rejects.toThrow(/No channel matches/);
	});

	test('table_add puts whole channels on the table, each in its own frame, in one call', async () => {
		const { tool, ops, items } = setup([{ id: 'old', type: 'note', x: 0, y: 0, w: 200, h: 200 }, { id: 'had', type: 'arena', url: 'https://www.are.na/block/100', x: 300, y: 0, w: 240, h: 240 }]);
		const done = JSON.parse(await out(tool('table_add'), { items: [{ source: 'arena', in: 'Calm Technology Research' }, { source: 'arena', in: 'Index of Calm Technologies' }] }));
		expect(done.added).toBe(46);
		expect(done.sections).toMatchObject([
			{ name: 'Calm Technology Research', added: 44, of: 45, already_on_table: 1, private: 1 },
			{ name: 'Index of Calm Technologies', added: 2, of: 2 }
		]);
		expect(done.sections[0].note).toContain('private');
		const added = ops.filter((op) => op.op === 'add_blocks');
		expect(added.map((op) => op.blocks!.length)).toEqual([44, 2]);
		// Below what was there, the second beside the first, and nothing on top of anything.
		expect(added[0].at!.y).toBeGreaterThan(240);
		expect(added[1].at!.x).toBeGreaterThan(added[0].at!.x + 8 * 240);
		expect(ops.filter((op) => op.op === 'frame').map((op) => op.name)).toEqual(['Calm Technology Research', 'Index of Calm Technologies']);
		const frames = items.filter((item) => item.type === 'frame');
		expect(frames[0].x + frames[0].w).toBeLessThan(frames[1].x);
		expect(done.items.map((item: { type: string }) => item.type)).toEqual(['frame', 'frame']);
	});

	test('asking twice adds nothing twice, and a wrong name says which names are close', async () => {
		const { tool } = setup();
		await out(tool('table_add'), { items: [{ source: 'arena', in: 'Index of Calm Technologies' }] });
		const again = JSON.parse(await out(tool('table_add'), { items: [{ source: 'arena', in: 'Index of Calm Technologies' }, { source: 'arena', in: 'calm' }] }));
		expect(again.sections[0]).toMatchObject({ added: 0, note: 'All of these were already on the table.' });
		expect(again.sections[1].error).toContain('Calm Technology Research');
	});

	test('a book’s highlights go on as quote cards', async () => {
		const { tool, ops } = setup();
		const done = JSON.parse(await out(tool('table_add'), { items: [{ source: 'readwise', in: 'Living With Complexity' }] }));
		expect(done.sections[0]).toMatchObject({ name: 'Living With Complexity', added: 2 });
		expect(ops.find((op) => op.op === 'add_blocks')!.blocks!.map((block) => block.kind)).toEqual(['quote', 'quote']);
	});
});

describe('are.na addresses given to fetch_page', () => {
	test('channels and blocks are read through the API; other pages are not', () => {
		expect(arenaAddress('https://www.are.na/casey-gollan/calm-technology')).toEqual({});
		expect(arenaAddress('https://www.are.na/block/12345')).toEqual({ block: '12345' });
		expect(arenaAddress('https://www.are.na/about')).toBeNull();
		expect(arenaAddress('https://www.are.na/explore/channels')).toBeNull();
		expect(arenaAddress('https://example.com/a/b')).toBeNull();
		expect(arenaAddress('/2026/some-post/')).toBeNull();
	});
});
