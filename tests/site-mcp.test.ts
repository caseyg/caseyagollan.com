import { describe, expect, test } from 'bun:test';
import { answerMcp, MCP_VERSIONS, mcpUnauthorized, serveMcp } from '../src/lib/server/mcp/server';
import { handleSiteMcp, pickTable, siteMcpServer } from '../src/lib/server/mcp/site';
import { chatExtension } from '../src/lib/server/chat/tools';
import { RemoteCanvas } from '../src/lib/server/chat/remote-canvas';
import type { TableSummary } from '../src/lib/tables';

const ORIGIN = 'https://caseyagollan.com';
const INDEX = [
	{ u: '/2026/11/01/hello/', t: 'Hello tables', y: 'note', d: '2026-11-01', x: 'A note about tables and canvases.' },
	{ u: '/library/book/', t: 'A Book', y: 'book', x: 'About reading.' }
];
const TABLES = [
	{ id: 'calm1234', name: 'Calm technology', created: '2026-11-01T00:00:00Z', updated: '2026-11-20T00:00:00Z', count: 2, preview: [], published: false },
	{ id: 'maps5678', name: 'Maps', created: '2026-10-01T00:00:00Z', updated: '2026-10-02T00:00:00Z', count: 0, preview: [] }
] satisfies TableSummary[];
const DOCUMENT = { store: {
	'shape:a': { typeName: 'shape', id: 'shape:a', type: 'site-block', x: 0, y: 0, props: { kind: 'post', w: 300, h: 200, title: 'Hello tables', url: `${ORIGIN}/2026/11/01/hello/`, excerpt: 'A note.' } },
	'shape:b': { typeName: 'shape', id: 'shape:b', type: 'note', x: 400, y: 0, props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remember this' }] }] } } }
} };

function fixture(micropub?: ((query: string, init?: RequestInit) => Promise<Response>) | null, scopes: string[] = ['read', 'draft', 'create', 'update']) {
	const files: Record<string, unknown> = { 'tables/index.json': TABLES, 'tables/calm1234.json': { ...TABLES[0], document: DOCUMENT } };
	const env = {
		ASSETS: { fetch: async (request: Request | string) => new URL(typeof request === 'string' ? request : request.url).pathname === '/pagefind/agent-index.json' ? Response.json(INDEX) : new Response('', { status: 404 }) },
		PUBLISHING_STATE: {
			get: async (key: string) => key in files ? { json: async () => files[key], text: async () => JSON.stringify(files[key]) } : null,
			put: async (key: string, value: string) => void (files[key] = JSON.parse(value))
		}
	};
	// One canvas per table thread, as the thread's Durable Object keeps.
	const canvases = new Map<string, RemoteCanvas>();
	const thread = (id: string) => {
		const canvas = canvases.get(id) ?? canvases.set(id, new RemoteCanvas()).get(id)!;
		return { viewAttach: async (view: string) => canvas.attach(view), viewNext: async (view: string, wait?: number) => canvas.next(view, wait), viewDone: async (view: string, reply: never) => canvas.done(view, reply), viewOpen: async () => canvas.open(), viewOp: async (op: never) => canvas.perform(op) };
	};
	const asked: string[] = [];
	const server = siteMcpServer({
		env: env as never, origin: ORIGIN, now: () => new Date('2026-11-25T20:00:00Z'), scopes, thread: thread as never,
		viewAssets: async () => ({ js: 'assets/view.js', css: 'assets/view.css' }),
		micropub: micropub ?? (async (query: string) => { asked.push(query); return Response.json({ items: [] }); })
	});
	const call = async (name: string, args: Record<string, unknown> = {}) =>
		((await answerMcp(server, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }))!.result as { content: { type: string; text?: string }[]; isError?: boolean; structuredContent?: Record<string, any> });
	return { server, call, asked, files };
}

describe('the MCP transport', () => {
	test('initialize answers in the version asked for, or the newest it knows', async () => {
		const { server } = fixture();
		const init = async (protocolVersion: string) => ((await answerMcp(server, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion } }))!.result as { protocolVersion: string; serverInfo: { name: string }; instructions: string });
		expect((await init('2025-06-18')).protocolVersion).toBe('2025-06-18');
		expect((await init('1999-01-01')).protocolVersion).toBe(MCP_VERSIONS[0]);
		expect((await init('2025-06-18')).serverInfo.name).toBe('caseyagollan');
	});

	test('notifications get 202 and no body; other methods are refused', async () => {
		const { server } = fixture();
		const post = (body: unknown) => serveMcp(new Request(`${ORIGIN}/mcp`, { method: 'POST', body: JSON.stringify(body) }), server);
		expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
		expect((await serveMcp(new Request(`${ORIGIN}/mcp`), server)).status).toBe(405);
		expect(((await (await post({ jsonrpc: '2.0', id: 2, method: 'prompts/list' })).json()) as { error: { code: number } }).error.code).toBe(-32601);
	});

	test('a caller without a token is told where the sign-in metadata is', async () => {
		const response = mcpUnauthorized(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
		expect(response.status).toBe(401);
		expect(response.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
		const scope = mcpUnauthorized('https://x/meta', { error: 'insufficient_scope', scope: 'read', status: 403 });
		expect(scope.status).toBe(403);
		expect(scope.headers.get('www-authenticate')).toContain('error="insufficient_scope", scope="read"');
	});
});

describe('who may call /mcp', () => {
	const tokens: Record<string, { active: boolean; scope?: string }> = { reader: { active: true, scope: 'read draft' }, login: { active: true, scope: 'profile' } };
	const ask = (token?: string, method = 'POST') => handleSiteMcp(
		new Request(`${ORIGIN}/mcp`, { method, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(method === 'POST' ? { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) } : {}) }),
		{ origin: ORIGIN, introspect: async (token) => tokens[token] ?? { active: false }, server: () => fixture().server }
	);

	test('no token, a dead token and a token without read are each turned away with the sign-in pointer', async () => {
		const none = await ask();
		expect(none.status).toBe(401);
		expect(none.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
		const dead = await ask('gone');
		expect(dead.status).toBe(401);
		expect(dead.headers.get('www-authenticate')).toContain('error="invalid_token"');
		// A token another site got for signing Casey in reads nothing here.
		const login = await ask('login');
		expect(login.status).toBe(403);
		expect(login.headers.get('www-authenticate')).toContain('scope="read"');
		expect((await ask(undefined, 'OPTIONS')).status).toBe(204);
	});

	test('a token Casey approved with read gets the tools', async () => {
		const response = await ask('reader');
		expect(response.status).toBe(200);
		expect(((await response.json()) as { result: { tools: unknown[] } }).result.tools.length).toBe(24);
	});
});

describe('the site’s tools over MCP', () => {
	test('offers the chat’s own tools, unchanged, and nothing that needs a chat or a canvas', async () => {
		const { server } = fixture();
		// What a client that draws no views is offered: everything that works without a canvas.
		const names = server.tools.filter((tool) => !tool.app).map((tool) => tool.name);
		expect(names).toEqual(['search_site', 'fetch_page', 'view_image', 'my_saves', 'micropub_list_posts', 'micropub_get_post', 'micropub_create_post', 'micropub_update_post', 'table_read', 'table_list']);
		const VIEW = ['table_open', 'table_view_load', 'table_view_save', 'table_view_next', 'table_view_done'];
		const chat = chatExtension({ env: {} as never, origin: () => ORIGIN, micropub: async () => Response.json({}), thread: { table: () => 'x' } as never }).tools!;
		for (const tool of server.tools.filter((one) => one.name !== 'table_list' && !VIEW.includes(one.name))) {
			const same = chat.find((one) => one.name === tool.name)!;
			expect(tool.description).toBe(same.description);
			// `table` here always says which table the call is about.
			const { table: _table, ...properties } = tool.inputSchema.properties as Record<string, unknown>;
			const { table: _new, ...own } = (same.parameters as { properties: Record<string, unknown> }).properties;
			expect(properties).toEqual(own);
		}
		const listed = (await answerMcp(server, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))!.result as { tools: Record<string, unknown>[] };
		expect(listed.tools.every((tool) => !('call' in tool) && typeof tool.title === 'string')).toBe(true);
		expect(listed.tools.find((tool) => tool.name === 'micropub_create_post')!.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
	});

	test('search_site searches the site’s index', async () => {
		const found = JSON.parse((await fixture().call('search_site', { query: 'tables' })).content[0].text!);
		expect(found.results[0]).toMatchObject({ url: `${ORIGIN}/2026/11/01/hello/`, title: 'Hello tables' });
	});

	test('table_list lists drafts too, and table_read reads one as saved, by name', async () => {
		const { call } = fixture();
		const list = JSON.parse((await call('table_list')).content[0].text!);
		expect(list.tables.map((table: { id: string; draft?: boolean }) => [table.id, !!table.draft])).toEqual([['calm1234', true], ['maps5678', false]]);
		const read = JSON.parse((await call('table_read', { table: 'calm' })).content[0].text!);
		expect(read).toMatchObject({ name: 'Calm technology', draft: true, note: 'As last saved.' });
		expect(read.items.map((item: { id: string; type: string; text?: string }) => [item.id, item.type])).toEqual([['a', 'post'], ['b', 'note']]);
		const missing = await call('table_read', { table: 'nothing like it' });
		expect(missing.isError).toBe(true);
		expect(missing.content[0].text).toContain('table_list');
	});

	test('posts go through Micropub as the caller, and its refusal is the answer', async () => {
		const { call, asked } = fixture();
		await call('micropub_list_posts', { limit: 3 });
		expect(asked[0]).toContain('q=source');
		const refused = fixture(async () => Response.json({ error: 'insufficient_scope', error_description: 'Requires create scope' }, { status: 403 }));
		const result = await refused.call('micropub_create_post', { content: 'Hello' });
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('permission');
	});

	test('pickTable takes an id, an address or a name, and says when a name is ambiguous', () => {
		expect(pickTable(TABLES, 'maps5678').id).toBe('maps5678');
		expect(pickTable(TABLES, `${ORIGIN}/tables/calm1234`).id).toBe('calm1234');
		expect(pickTable(TABLES, 'MAPS').id).toBe('maps5678');
		expect(() => pickTable(TABLES, 'a')).toThrow('More than one');
		expect(() => pickTable(TABLES, '')).toThrow('Say which');
	});
});

describe('a table open as a canvas inside Claude', () => {
	const VIEW = 'viewaaaa1111';
	const rpc = async (server: ReturnType<typeof fixture>['server'], method: string, params: Record<string, unknown> = {}, apps = true) => (await answerMcp(server, { jsonrpc: '2.0', id: 1, method, params }, { apps }))! as { result?: any; error?: { code: number } };

	test('a client that draws views is offered table_open and the canvas tools; one that doesn’t is not', async () => {
		const { server } = fixture();
		const drawn = (await rpc(server, 'tools/list')).result.tools as { name: string; _meta?: { ui?: { resourceUri?: string; visibility?: string[] } } }[];
		expect(drawn.find((tool) => tool.name === 'table_open')!._meta!.ui!.resourceUri).toBe('ui://caseyagollan/table.html');
		expect(drawn.find((tool) => tool.name === 'table_view_save')!._meta!.ui!.visibility).toEqual(['app']);
		expect(drawn.some((tool) => tool.name === 'table_add')).toBe(true);
		const plain = (await rpc(server, 'tools/list', {}, false)).result.tools as { name: string }[];
		expect(plain.map((tool) => tool.name)).not.toContain('table_open');
		expect(plain.map((tool) => tool.name)).not.toContain('table_add');
		expect((await rpc(server, 'resources/list', {}, false)).result.resources).toEqual([]);
		expect((await rpc(server, 'tools/call', { name: 'table_view_save', arguments: {} }, false)).error!.code).toBe(-32602);
	});

	test('the view’s page loads its script from the site and names every host it reaches', async () => {
		const { server } = fixture();
		expect((await rpc(server, 'resources/list')).result.resources[0]).toMatchObject({ uri: 'ui://caseyagollan/table.html', mimeType: 'text/html;profile=mcp-app' });
		const [page] = (await rpc(server, 'resources/read', { uri: 'ui://caseyagollan/table.html' })).result.contents;
		expect(page.text).toContain(`<script type="module" crossorigin src="${ORIGIN}/mcp-app/assets/view.js">`);
		expect(page.text).toContain(`window.__SITE_ORIGIN__="${ORIGIN}"`);
		expect(page._meta.ui.csp.connectDomains).toContain(ORIGIN);
		expect(page._meta.ui.csp.resourceDomains).toEqual(expect.arrayContaining([ORIGIN, 'https://cdn.tldraw.com', 'https://files.caseyagollan.com']));
		expect(page._meta.ui.domain).toBe('4844f83a7682cf3cc0d8c4973f2bd727.claudemcpcontent.com');
	});

	test('table_open shows a table, or makes a new draft and shows that', async () => {
		const { call, files } = fixture();
		const opened = await call('table_open', { table: 'calm' });
		expect(opened.structuredContent!.table).toEqual({ id: 'calm1234', name: 'Calm technology', url: `${ORIGIN}/tables/calm1234`, draft: true });
		expect(opened.content[0].text).toContain('Hello tables');
		const made = await call('table_open', { new: 'Field notes' });
		const id = made.structuredContent!.table.id as string;
		expect(files[`tables/${id}.json`]).toMatchObject({ name: 'Field notes', published: false });
	});

	test('a table tool’s change is made by the open view, and refused when none is open', async () => {
		const { call } = fixture();
		const closed = await call('table_move', { table: 'calm1234', moves: [{ id: 'a', x: 40, y: 40 }] });
		expect(closed.isError).toBe(true);
		expect(closed.content[0].text).toContain('table_open');
		expect((await call('table_view_load', { table: 'calm1234', view: VIEW })).structuredContent).toMatchObject({ editable: true, table: { id: 'calm1234', document: DOCUMENT } });
		// The view takes each change the tool asks for and reports back, until the tool has its answer.
		const seen: string[] = [];
		let answered = false;
		const asking = call('table_move', { table: 'calm1234', moves: [{ id: 'a', x: 40, y: 40 }] }).finally(() => (answered = true));
		while (!answered) {
			const turn = (await call('table_view_next', { table: 'calm1234', view: VIEW, wait: 50 })).structuredContent as { op?: { id: string; op: string } };
			if (!turn.op) continue;
			seen.push(turn.op.op);
			await call('table_view_done', { table: 'calm1234', view: VIEW, id: turn.op.id, ok: true, result: turn.op.op === 'move' ? { moved: 1 } : { items: [], selected: [] } });
		}
		expect(seen[0]).toBe('move');
		expect((await asking).content[0].text).toContain('"moved":1');
		// A second view of the same table takes over; the first is told so.
		await call('table_view_load', { table: 'calm1234', view: 'viewbbbb2222' });
		expect((await call('table_view_next', { table: 'calm1234', view: VIEW, wait: 0 })).structuredContent).toEqual({ replaced: true });
	});

	test('the view saves the canvas and a new name', async () => {
		const { call, files } = fixture();
		const next = { schema: { schemaVersion: 2, sequences: {} }, store: { 'shape:c': { typeName: 'shape', id: 'shape:c', type: 'note', x: 0, y: 0, props: {} } } };
		const saved = await call('table_view_save', { table: 'calm1234', view: VIEW, document: next, name: '  Calmer  ' });
		expect(saved.structuredContent).toMatchObject({ name: 'Calmer', saved: '2026-11-25T20:00:00.000Z' });
		expect(files['tables/calm1234.json']).toMatchObject({ name: 'Calmer', document: next, published: false });
		expect((await call('table_view_save', { table: 'calm1234', view: VIEW, document: 'nonsense' })).isError).toBe(true);
		expect((await call('table_view_save', { table: 'calm1234', view: 'no', name: 'x' })).isError).toBe(true);
	});

	test('a connection that may only read can look at a table and change nothing', async () => {
		const { call, files } = fixture(null, ['read']);
		expect((await call('table_view_load', { table: 'calm1234', view: VIEW })).structuredContent).toMatchObject({ editable: false });
		for (const refused of [await call('table_view_save', { table: 'calm1234', view: VIEW, name: 'Mine now' }), await call('table_add', { table: 'calm1234', items: [{ note: 'x' }] }), await call('table_open', { new: 'Another' })]) {
			expect(refused.isError).toBe(true);
			expect(refused.content[0].text).toContain('permission');
		}
		expect((files['tables/calm1234.json'] as { name: string }).name).toBe('Calm technology');
	});
});
