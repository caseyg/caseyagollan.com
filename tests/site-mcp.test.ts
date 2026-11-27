import { describe, expect, test } from 'bun:test';
import { answerMcp, MCP_VERSIONS, mcpUnauthorized, serveMcp } from '../src/lib/server/mcp/server';
import { handleSiteMcp, pickTable, siteMcpServer } from '../src/lib/server/mcp/site';
import { chatExtension } from '../src/lib/server/chat/tools';
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

function fixture(micropub?: (query: string, init?: RequestInit) => Promise<Response>) {
	const files: Record<string, unknown> = { 'tables/index.json': TABLES, 'tables/calm1234.json': { ...TABLES[0], document: DOCUMENT } };
	const env = {
		ASSETS: { fetch: async (request: Request | string) => new URL(typeof request === 'string' ? request : request.url).pathname === '/pagefind/agent-index.json' ? Response.json(INDEX) : new Response('', { status: 404 }) },
		PUBLISHING_STATE: { get: async (key: string) => key in files ? { json: async () => files[key], text: async () => JSON.stringify(files[key]) } : null }
	};
	const asked: string[] = [];
	const server = siteMcpServer({
		env: env as never, origin: ORIGIN, now: () => new Date('2026-11-25T20:00:00Z'),
		micropub: micropub ?? (async (query) => { asked.push(query); return Response.json({ items: [] }); })
	});
	const call = async (name: string, args: Record<string, unknown> = {}) =>
		((await answerMcp(server, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }))!.result as { content: { type: string; text?: string }[]; isError?: boolean });
	return { server, call, asked };
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
		expect(((await (await post({ jsonrpc: '2.0', id: 2, method: 'resources/list' })).json()) as { error: { code: number } }).error.code).toBe(-32601);
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
		expect(((await response.json()) as { result: { tools: unknown[] } }).result.tools.length).toBe(10);
	});
});

describe('the site’s tools over MCP', () => {
	test('offers the chat’s own tools, unchanged, and nothing that needs a chat or a canvas', async () => {
		const { server } = fixture();
		const names = server.tools.map((tool) => tool.name);
		expect(names).toEqual(['search_site', 'fetch_page', 'view_image', 'my_saves', 'micropub_list_posts', 'micropub_get_post', 'micropub_create_post', 'micropub_update_post', 'table_read', 'table_list']);
		const chat = chatExtension({ env: {} as never, origin: () => ORIGIN, micropub: async () => Response.json({}), thread: { table: () => 'x' } as never }).tools!;
		for (const tool of server.tools.filter((one) => one.name !== 'table_list')) {
			const same = chat.find((one) => one.name === tool.name)!;
			expect(tool.description).toBe(same.description);
			const { table: _table, ...properties } = tool.inputSchema.properties as Record<string, unknown>;
			expect(properties).toEqual((same.parameters as { properties: Record<string, unknown> }).properties);
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
