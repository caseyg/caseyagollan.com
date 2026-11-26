import { describe, expect, test } from 'bun:test';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import { CodemodeSandbox } from '@earendil-works/pi-codemode';
import { createRegistry, Harness, MemoryStorage } from '@earendil-works/pi-durable';
import { createCodemodeExtension } from '@earendil-works/pi-durable/codemode';
import { MCP_SERVERS, mcpServer } from '../src/lib/mcp-servers';
import { McpAuthError, McpSession, readsOnly, replyFrom } from '../src/lib/server/mcp/client';
import { bearer, connections, disconnect, finishConnect, markBroken, mcpDeps, setWrites, startConnect, usableServers, McpConnectError } from '../src/lib/server/mcp/connections';
import { budgeted, withOutputBudget, mcpExtension, mcpNamespaces, mcpToolName, mcpTools, parametersOf, scriptCalls, sectionsWhen, serverNames } from '../src/lib/server/chat/mcp-tools';
import { isPrivateTool, projectMessages, SAY_KIND, toolLabel } from '../src/lib/server/chat/projection';
import { chatExtension, isOwnerTool } from '../src/lib/server/chat/tools';
import { sha256 } from '../src/lib/server/publishing/dpop';

const READWISE = mcpServer('readwise')!, ARENA = mcpServer('arena')!;

function bucket() {
	const files = new Map<string, string>();
	return {
		files,
		async get(key: string) { const value = files.get(key); return value === undefined ? null : { json: async () => JSON.parse(value), text: async () => value }; },
		async put(key: string, data: string) { files.set(key, data); return {}; },
		async delete(keys: string | string[]) { for (const key of [keys].flat()) files.delete(key); }
	};
}

const TOOLS = [
	{ name: 'reader_search_documents', description: 'Search the full text of Reader documents.', inputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] }, annotations: { readOnlyHint: true } },
	{ name: 'reader_create_document', description: 'Save a URL to Reader.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, annotations: { readOnlyHint: false } }
];

/** Readwise's MCP server and its authorization server, enough of each to sign in and call a tool. */
function service(options: { sse?: boolean; expiresIn?: number } = {}) {
	const seen: { url: string; method: string; headers: Headers; body: string }[] = [];
	const state = { token: 'access-1', refresh: 'refresh-1', registered: 0, refreshes: 0, revoked: [] as string[], refuse: false, session: 'sess-1', calls: [] as { name: string; arguments: Record<string, unknown> }[] };
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input), method = init?.method ?? 'GET', headers = new Headers(init?.headers), body = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : '';
		seen.push({ url, method, headers, body });
		const form = new URLSearchParams(body);
		if (url === READWISE.url) {
			if (headers.get('authorization') !== `Bearer ${state.token}` || state.refuse) return new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://mcp2.readwise.io/.well-known/oauth-protected-resource/mcp"' } });
			const message = JSON.parse(body) as { id?: number; method: string; params?: { name?: string; arguments?: Record<string, unknown>; cursor?: string } };
			if (message.id === undefined) return new Response(null, { status: 202 });
			let result: unknown;
			if (message.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'readwise', version: '1' } };
			else if (message.method === 'tools/list') result = message.params?.cursor ? { tools: [TOOLS[1]] } : { tools: [TOOLS[0]], nextCursor: 'page2' };
			else if (message.method === 'tools/call') {
				state.calls.push({ name: message.params!.name!, arguments: message.params!.arguments ?? {} });
				result = message.params!.name === 'reader_search_documents'
					? { content: [{ type: 'text', text: JSON.stringify({ results: [{ title: 'Calm Technology', url: 'https://read.readwise.io/read/1', summary: 'private notes' }, { title: 'Second', url: 'https://read.readwise.io/read/2', summary: 'x'.repeat(5000) }] }) }] }
					: { content: [{ type: 'text', text: 'No such document' }], isError: true };
			}
			const reply = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
			return options.sse
				? new Response(`event: message\ndata: ${reply}\n\n`, { headers: { 'content-type': 'text/event-stream', 'mcp-session-id': state.session } })
				: new Response(reply, { headers: { 'content-type': 'application/json', 'mcp-session-id': state.session } });
		}
		if (url === 'https://mcp2.readwise.io/.well-known/oauth-protected-resource/mcp') return Response.json({ resource: READWISE.url, authorization_servers: ['https://readwise.io/o/'], scopes_supported: ['openid', 'read', 'write'] });
		if (url === 'https://readwise.io/.well-known/oauth-authorization-server/o') return Response.json({ issuer: 'https://readwise.io/o/', authorization_endpoint: 'https://readwise.io/o/authorize/', token_endpoint: 'https://readwise.io/o/token/', registration_endpoint: 'https://readwise.io/o/register/', revocation_endpoint: 'https://readwise.io/o/revoke-token/', code_challenge_methods_supported: ['S256'] });
		if (url === 'https://readwise.io/o/register/') { state.registered++; return Response.json({ client_id: `client-${state.registered}` }, { status: 201 }); }
		if (url === 'https://readwise.io/o/token/') {
			if (form.get('grant_type') === 'authorization_code') {
				if (form.get('code') !== 'good-code') return Response.json({ error: 'invalid_grant' }, { status: 400 });
				return Response.json({ access_token: state.token, refresh_token: state.refresh, expires_in: options.expiresIn ?? 3600, scope: 'read write' });
			}
			if (form.get('refresh_token') !== state.refresh) return Response.json({ error: 'invalid_grant' }, { status: 400 });
			state.refreshes++;
			state.token = `access-${state.refreshes + 1}`;
			state.refresh = `refresh-${state.refreshes + 1}`;
			return Response.json({ access_token: state.token, refresh_token: state.refresh, expires_in: 3600 });
		}
		if (url === 'https://readwise.io/o/revoke-token/') { state.revoked.push(form.get('token') ?? ''); return new Response(null, { status: 200 }); }
		return new Response('Not found', { status: 404 });
	}) as typeof fetch;
	return { fetcher, seen, state };
}

function setup(options: Parameters<typeof service>[0] & { env?: Record<string, string> } = {}) {
	const store = bucket(), remote = service(options);
	let now = Date.UTC(2026, 10, 25);
	const deps = { ...mcpDeps({ PUBLISHING_STATE: store as never, ...options.env }, remote.fetcher)!, now: () => now };
	return { store, ...remote, deps, tick: (ms: number) => { now += ms; } };
}

/** Sign in the way /account does: start, follow the server's redirect, come back with a code. */
async function signIn(world: ReturnType<typeof setup>, origin = 'https://caseyagollan.com') {
	const page = new URL(await startConnect(world.deps, READWISE, origin, 'this-browser'));
	const callback = new URLSearchParams({ code: 'good-code', state: page.searchParams.get('state')! });
	await finishConnect(world.deps, callback, 'this-browser');
	return page;
}

describe('the MCP client', () => {
	test('reads a reply from JSON or an event stream, by its id', () => {
		expect(replyFrom('{"jsonrpc":"2.0","id":2,"result":{"ok":true}}', 'application/json', 2)?.result).toEqual({ ok: true });
		expect(replyFrom(': keep-alive\n\nevent: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"n":1}}\n\n', 'text/event-stream; charset=utf-8', 3)?.result).toEqual({ n: 1 });
		expect(replyFrom('<html>', 'text/html', 1)).toBeUndefined();
	});

	for (const sse of [false, true]) {
		test(`introduces itself once, lists every page of tools and calls one (${sse ? 'event stream' : 'JSON'})`, async () => {
			const { fetcher, seen, state } = service({ sse });
			const session = new McpSession(READWISE.url, async () => state.token, fetcher);
			expect((await session.listTools()).map((tool) => tool.name)).toEqual(['reader_search_documents', 'reader_create_document']);
			const result = await session.callTool('reader_search_documents', { query: 'calm' });
			expect(JSON.parse(result.text).results[0].title).toBe('Calm Technology');
			expect(result.isError).toBe(false);
			expect((await session.callTool('reader_get', {})).isError).toBe(true);
			const methods = seen.map((request) => JSON.parse(request.body).method);
			expect(methods.filter((method) => method === 'initialize')).toHaveLength(1);
			expect(methods[1]).toBe('notifications/initialized');
			// Once the server names a session, every later request carries it.
			expect(seen.at(-1)!.headers.get('mcp-session-id')).toBe('sess-1');
		});
	}

	test('a refused token is its own error, so the chat can ask Casey to connect again', async () => {
		const { fetcher } = service();
		await expect(new McpSession(READWISE.url, async () => 'stale', fetcher).listTools()).rejects.toBeInstanceOf(McpAuthError);
	});

	test('tells reading tools from ones that change things', () => {
		expect(readsOnly({ name: 'anything', annotations: { readOnlyHint: true } })).toBe(true);
		expect(readsOnly({ name: 'get_thing', annotations: { readOnlyHint: false } })).toBe(false);
		for (const name of ['getChannelContents', 'search', 'list_collections', 'reader_search_documents', 'find_bookmarks', 'channelDigest']) expect([name, readsOnly({ name })]).toEqual([name, true]);
		for (const name of ['createBlock', 'searchAndConnect', 'update_bookmark', 'reader_create_document', 'delete_collection', 'mystery']) expect([name, readsOnly({ name })]).toEqual([name, false]);
	});
});

describe('MCP sign-in from /account', () => {
	test('finds the authorization server, registers once, and signs in with PKCE', async () => {
		const world = setup();
		const page = await signIn(world);
		expect(page.origin + page.pathname).toBe('https://readwise.io/o/authorize/');
		expect(Object.fromEntries(page.searchParams)).toMatchObject({ response_type: 'code', client_id: 'client-1', redirect_uri: 'https://caseyagollan.com/oauth/mcp/callback', code_challenge_method: 'S256', resource: READWISE.url, scope: 'read write' });
		const registration = JSON.parse(world.seen.find((request) => request.url.endsWith('/register/'))!.body);
		expect(registration).toMatchObject({ redirect_uris: ['https://caseyagollan.com/oauth/mcp/callback'], token_endpoint_auth_method: 'none', client_name: 'caseyagollan.com' });
		const exchange = new URLSearchParams(world.seen.find((request) => request.url.endsWith('/token/'))!.body);
		expect(await sha256(exchange.get('code_verifier')!)).toBe(page.searchParams.get('code_challenge')!);
		expect(exchange.get('client_id')).toBe('client-1');
		expect(await bearer(world.deps, READWISE)).toBe('access-1');
		// Connecting again reuses the registration; a preview's own address gets its own.
		await signIn(world);
		expect(world.state.registered).toBe(1);
		await signIn(world, 'https://branch-caseyagollan.caseygollan.workers.dev');
		expect(world.state.registered).toBe(2);
		// The pending sign-in is used up.
		expect([...world.store.files.keys()].some((key) => key.includes('/pending/'))).toBe(false);
	});

	test('refuses an answer from another browser, a replay, and a refusal', async () => {
		const world = setup();
		const state = () => startConnect(world.deps, READWISE, 'https://caseyagollan.com', 'this-browser').then((href) => new URL(href).searchParams.get('state')!);
		await expect(finishConnect(world.deps, new URLSearchParams({ code: 'good-code', state: await state() }), 'another-browser')).rejects.toThrow(/another browser/);
		const used = await state();
		await finishConnect(world.deps, new URLSearchParams({ code: 'good-code', state: used }), 'this-browser');
		await expect(finishConnect(world.deps, new URLSearchParams({ code: 'good-code', state: used }), 'this-browser')).rejects.toThrow(/expired/);
		await expect(finishConnect(world.deps, new URLSearchParams({ error: 'access_denied', state: await state() }), 'this-browser')).rejects.toThrow(/not allowed/);
		await expect(finishConnect(world.deps, new URLSearchParams({ code: 'bad', state: await state() }), 'this-browser')).rejects.toBeInstanceOf(McpConnectError);
		await expect(finishConnect(world.deps, new URLSearchParams({ code: 'good-code', state: await state(), iss: 'https://evil.example' }), 'this-browser')).rejects.toThrow(/didn’t come from/);
	});

	test('what /account is told never includes a token', async () => {
		const world = setup({ env: { ARENA_PAT: 'pat-secret' } });
		await signIn(world);
		const shown = await connections(world.deps);
		expect(shown.map((one) => [one.id, one.connected, one.via])).toEqual([['readwise', true, 'oauth'], ['arena', false, 'token'], ['raindrop', false, undefined]]);
		expect(shown[0].tools).toEqual([{ name: 'reader_search_documents', reads: true }, { name: 'reader_create_document', reads: false }]);
		const text = JSON.stringify(shown);
		for (const secret of ['access-1', 'refresh-1', 'pat-secret', 'client-1']) expect(text).not.toContain(secret);
	});

	test('refreshes a token that is about to run out, once, and keeps the new pair', async () => {
		const world = setup({ expiresIn: 600 });
		await signIn(world);
		world.tick(590_000);
		expect(await Promise.all([bearer(world.deps, READWISE), bearer(world.deps, READWISE)])).toEqual(['access-2', 'access-2']);
		expect(world.state.refreshes).toBe(1);
		world.tick(3_600_000);
		expect(await bearer(world.deps, READWISE)).toBe('access-3');
	});

	test('a refused refresh marks the connection broken instead of failing quietly', async () => {
		const world = setup({ expiresIn: 600 });
		await signIn(world);
		world.state.refresh = 'rotated-elsewhere';
		world.tick(590_000);
		await expect(bearer(world.deps, READWISE)).rejects.toBeInstanceOf(McpAuthError);
		const [readwise] = await connections(world.deps);
		expect(readwise.connected).toBe(false);
		expect(readwise.broken?.reason).toMatch(/invalid_grant/);
		expect(await usableServers(world.deps)).toEqual([]);
	});

	test('a personal token stands in for Are.na until OAuth is connected', async () => {
		const world = setup({ env: { ARENA_PAT: ' pat-secret ' } });
		expect(await bearer(world.deps, ARENA)).toBe('pat-secret');
		await expect(bearer(world.deps, READWISE)).rejects.toThrow(/isn’t connected/);
	});

	test('the chat gets only reading tools until Casey allows changes', async () => {
		const world = setup();
		await signIn(world);
		expect((await usableServers(world.deps))[0].tools.map((tool) => tool.name)).toEqual(['reader_search_documents']);
		await setWrites(world.deps, READWISE, true);
		expect((await usableServers(world.deps))[0].tools.map((tool) => tool.name)).toEqual(['reader_search_documents', 'reader_create_document']);
		expect((await connections(world.deps))[0].writes).toBe(true);
	});

	test('disconnecting tells the server and forgets the sign-in and its tools', async () => {
		const world = setup();
		await signIn(world);
		await disconnect(world.deps, READWISE);
		expect(world.state.revoked).toEqual(['refresh-1']);
		expect((await connections(world.deps))[0]).toMatchObject({ connected: false });
		expect((await connections(world.deps))[0].tools).toBeUndefined();
		expect(await usableServers(world.deps)).toEqual([]);
		await markBroken(world.deps, READWISE, 'nothing to mark');
		expect([...world.store.files.keys()].filter((key) => key.includes('session'))).toEqual([]);
	});

	test('every server is reached over HTTPS at a fixed address', () => {
		expect(MCP_SERVERS.map((server) => server.id)).toEqual(['readwise', 'arena', 'raindrop']);
		for (const server of MCP_SERVERS) expect(server.url.startsWith('https://')).toBe(true);
	});
});

describe('MCP tools in the chat', () => {
	const servers = [{ server: READWISE, tools: TOOLS }];

	test('each server tool becomes a tool only scripts may call', () => {
		const tools = mcpTools(servers, async () => ({ text: '', images: [], isError: false }));
		expect(tools.map((tool) => [tool.name, tool.callers, tool.replay])).toEqual([['mcp__readwise__reader_search_documents', ['tools'], 'safe'], ['mcp__readwise__reader_create_document', ['tools'], undefined]]);
		expect(parametersOf(TOOLS[0])).toEqual({ type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] });
		expect(parametersOf({ name: 'bare' })).toEqual({ type: 'object', properties: {} });
		expect(mcpToolName(ARENA, 'get-channel.contents')).toBe('mcp__arena__get_channel_contents');
		expect(mcpNamespaces(servers)).toEqual([{ name: 'Readwise', prefix: 'mcp__readwise__', description: READWISE.guide }]);
		expect(serverNames([{ server: READWISE }, { server: ARENA }, { server: mcpServer('raindrop')! }])).toBe('Readwise, Are.na and Raindrop');
	});

	test('scripts and the servers’ tools are Casey’s alone, and their results stay out of the thread', async () => {
		for (const name of ['codemode', 'mcp__readwise__reader_search_documents', 'mcp__arena__getChannel']) {
			expect([name, isOwnerTool(name)]).toEqual([name, true]);
			expect([name, isPrivateTool(name)]).toEqual([name, true]);
		}
		const extension = chatExtension({ env: {} as never, origin: () => 'https://caseyagollan.com/', onlyOwner: () => false, mcp: () => 'Readwise' });
		const hooks = extension.hooks as unknown as { handlers: { beforeTool?: (call: unknown, api: unknown, context: unknown) => Promise<{ block?: string } | undefined>; beforeProviderRequest?: (request: unknown, api: unknown, context: unknown) => Promise<{ payload: { tools?: { function: { name: string } }[] } } | undefined> } }[];
		const api = { conversationId: 'c', snapshot: async () => ({ run: { turns: 0, first: 'e1' } }), entries: async () => ({ items: [{ kind: SAY_KIND, data: { owner: false } }] }) };
		let sent: string[] = [];
		for (const hook of hooks) { const changed = await hook.handlers.beforeProviderRequest?.({ payload: { tools: [{ type: 'function', function: { name: 'search_site' } }, { type: 'function', function: { name: 'codemode' } }], messages: [] } }, api, {}); if (changed) sent = (changed.payload.tools ?? []).map((tool) => tool.function.name); }
		expect(sent).toEqual(['search_site']);
		for (const name of ['codemode', 'mcp__readwise__reader_search_documents']) {
			const verdicts = await Promise.all(hooks.map((hook) => hook.handlers.beforeTool?.({ name, arguments: {} }, api, {})));
			expect(verdicts.some((verdict) => verdict?.block?.includes('Only Casey'))).toBe(true);
		}
		// Nor does the prompt mention scripts to anyone else.
		expect(await extension.sections!.find((section) => section.key === 'saves')!.render({} as never, {} as never)).toBeUndefined();
		const mine = chatExtension({ env: {} as never, origin: () => 'https://caseyagollan.com/', onlyOwner: () => true, mcp: () => 'Readwise' });
		expect(await mine.sections!.find((section) => section.key === 'saves')!.render({} as never, {} as never)).toContain('Scripts: Readwise is also connected');
		const without = chatExtension({ env: {} as never, origin: () => 'https://caseyagollan.com/', onlyOwner: () => true, mcp: () => '' });
		expect(await without.sections!.find((section) => section.key === 'saves')!.render({} as never, {} as never)).not.toContain('codemode');
		// The chat's own tools stay out of scripts' reach, so code mode lists only the servers' tools.
		for (const tool of mine.tools!) expect(tool.callers).toEqual(['model']);
	});

	test('every script gets the chat’s output budget unless it sets its own', () => {
		expect(withOutputBudget('return 1')).toBe('// @options: {"max_output_tokens": 4000}\nreturn 1');
		expect(withOutputBudget('// @options: {"timeout_ms": 5000}\nreturn 1')).toBe('// @options: {"timeout_ms": 5000}\nreturn 1');
	});

	test('a section can be shown to Casey only', async () => {
		let owner = true;
		const gated = sectionsWhen({ name: 'x', sections: [{ key: 'codemode', render: () => 'tools…' }] }, () => owner);
		expect(await gated.sections![0].render({} as never, {} as never)).toBe('tools…');
		owner = false;
		expect(await gated.sections![0].render({} as never, {} as never)).toBeUndefined();
	});

	test('a script step is labelled by the services it asked, and its result is not shown', () => {
		const code = 'const found = await tools.mcp__readwise__reader_search_documents({ query: "calm" });\nconst more = await tools["mcp__arena__getChannelContents"]({ id: "x" });\nreturn JSON.parse(found).results.length;';
		expect(scriptCalls(code)).toEqual(['readwise: reader search documents', 'arena: get channel contents']);
		expect(toolLabel('codemode', { code })).toBe('Asked Readwise: reader search documents and 1 more');
		expect(toolLabel('codemode', { code: 'return 1 + 1' })).toBe('Ran a script');
		const say = { id: 'e1', kind: SAY_KIND, data: { id: 'm1', author: { id: 'casey', name: 'Casey', via: 'owner' }, owner: true, at: 1, text: 'search reader' } };
		const messages = projectMessages([
			say as never,
			{ id: 'e2', kind: 'pi.assistant', model: [{ role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'codemode', arguments: { code } }] }] },
			{ id: 'e3', kind: 'pi.tool-result', model: [{ role: 'toolResult', toolCallId: 'c1', toolName: 'codemode', content: [{ type: 'text', text: 'Script completed\nprivate notes' }], isError: false }] }
		]);
		const step = messages.at(-1)!.tools![0];
		expect(step.status).toBe('done');
		expect(step.response).toBeUndefined();
		expect(JSON.stringify(messages)).not.toContain('private notes');
	});
});

describe('a script run by Pi', () => {
	/** A real Harness with the chat's own gate, code mode, and the bridged tools over a stand-in server. */
	async function world(owner: () => boolean) {
		const remote = service();
		const session = new McpSession(READWISE.url, async () => remote.state.token, remote.fetcher);
		const faux = fauxProvider();
		const models = createModels();
		models.setProvider(faux.provider);
		const registry = createRegistry();
		const sandbox = new CodemodeSandbox({ timeoutMs: 20_000 });
		registry.install(chatExtension({ env: {} as never, origin: () => 'https://caseyagollan.com/', onlyOwner: owner, mcp: () => 'Readwise' }));
		registry.install(mcpExtension([{ server: READWISE, tools: TOOLS.slice(0, 1) }], (_server, tool, args) => session.callTool(tool, args)));
		registry.install(budgeted(sectionsWhen(createCodemodeExtension({ sandbox, namespaces: mcpNamespaces([{ server: READWISE }]), models: false }), owner)));
		const harness = await Harness.open(new MemoryStorage(), { models, registry }, BACKGROUND_CONTEXT);
		const model = faux.getModel();
		const root = await harness.root(BACKGROUND_CONTEXT, { agent: { model: { provider: model.provider, modelId: model.id } } });
		const requests: { tools: string[]; system: string }[] = [];
		const ask = async (code: string) => {
			faux.setResponses([
				(context) => { const prompts = context.messages.filter((message) => message.role === 'system') as unknown as { sections?: Record<string, string>; toolsAdded?: { name: string }[] }[];
					requests.push({ tools: prompts.flatMap((prompt) => (prompt.toolsAdded ?? []).map((tool) => tool.name)), system: prompts.flatMap((prompt) => Object.values(prompt.sections ?? {})).join('\n\n') });
					return fauxAssistantMessage([fauxToolCall('codemode', { code })], { stopReason: 'toolUse' }); },
				(context) => { const last = context.messages.at(-1) as { role: string; content: { type: string; text?: string }[]; isError?: boolean }; return fauxAssistantMessage(`${last.isError ? 'ERROR ' : ''}${last.content.map((part) => part.text ?? '').join('\n')}`); }
			]);
			const settled = await (await root.submit({ type: 'input', content: 'What have I saved about calm technology?' }, BACKGROUND_CONTEXT)).wait(BACKGROUND_CONTEXT);
			const entries = await root.entries({ order: 'descending' }, 1, undefined, BACKGROUND_CONTEXT);
			const answer = (entries.items[0].model?.[0] as { content: { text?: string }[] }).content.map((part) => part.text ?? '').join('');
			return { settled, answer };
		};
		return { ask, requests, remote, close: async () => { await harness.close(BACKGROUND_CONTEXT); await sandbox.close(); } };
	}

	test('calls a server’s tool, and only what the script returns reaches the model', async () => {
		const { ask, requests, remote, close } = await world(() => true);
		try {
			const { settled, answer } = await ask('const found = JSON.parse(await tools.mcp__readwise__reader_search_documents({ query: "calm technology", limit: 5 }));\nreturn found.results.map((item) => ({ title: item.title, url: item.url }));');
			expect(settled.status).toBe('done');
			expect(remote.state.calls).toEqual([{ name: 'reader_search_documents', arguments: { query: 'calm technology', limit: 5 } }]);
			expect(answer).toContain('Calm Technology');
			expect(answer).toContain('https://read.readwise.io/read/2');
			// The 5,000 characters the script left out never reach the model.
			expect(answer).not.toContain('xxxxxxxx');
			expect(answer.startsWith('ERROR')).toBe(false);
			// The model is offered the script tool, never the server's tools one by one; the prompt lists their signatures.
			expect(requests[0].tools).toContain('codemode');
			expect(requests[0].tools.some((name) => name.startsWith('mcp__'))).toBe(false);
			expect(requests[0].system).toContain('mcp__readwise__reader_search_documents');
			expect(requests[0].system).toContain(READWISE.guide);
			// Scripts reach the servers' tools and nothing else of the chat's.
			expect(requests[0].system).not.toMatch(/### `search_site`/);
			const blocked = await ask('return await tools.search_site({ query: "x" });');
			expect(blocked.answer.startsWith('ERROR')).toBe(true);
		} finally { await close(); }
	}, 30_000);

	test('a wrong argument comes back to the script as an error it can read', async () => {
		const { ask, remote, close } = await world(() => true);
		try {
			const { answer } = await ask('try { await tools.mcp__readwise__reader_search_documents({ limit: "many" }); return "called"; } catch (error) { return "refused: " + error.message; }');
			expect(answer).toContain('refused:');
			expect(remote.state.calls).toEqual([]);
		} finally { await close(); }
	}, 30_000);

	test('in anyone else’s run the script tool is refused, and so is every server tool', async () => {
		const { ask, requests, remote, close } = await world(() => false);
		try {
			const { answer } = await ask('return await tools.mcp__readwise__reader_search_documents({ query: "calm" });');
			expect(answer).toContain('Only Casey');
			expect(remote.state.calls).toEqual([]);
			// The prompt says nothing of scripts or the servers' tools. (The request hook, which works on the
			// gateway's payload, takes `codemode` itself out of what the model is offered: tested above.)
			expect(requests[0].system).not.toContain('mcp__readwise__');
			expect(requests[0].system).not.toContain('Scripts:');
			expect(requests[0].tools.some((name) => name.startsWith('mcp__'))).toBe(false);
		} finally { await close(); }
	}, 30_000);
});

describe('a service with no sign-in for this site', () => {
	test('Raindrop is token-only: no sign-in is started, and /account is told so', async () => {
		const { MCP_SERVERS } = await import('../src/lib/mcp-servers');
		const { startConnect, connections } = await import('../src/lib/server/mcp/connections');
		const raindrop = MCP_SERVERS.find((server) => server.id === 'raindrop')!;
		const store = new Map<string, string>();
		const bucket = { get: async (key: string) => store.has(key) ? { text: async () => store.get(key)!, json: async () => JSON.parse(store.get(key)!) } : null, put: async (key: string, value: string) => { store.set(key, value); }, delete: async (key: string) => { store.delete(key); }, list: async () => ({ objects: [] }) };
		let asked = 0;
		const deps = { bucket, env: { RAINDROP_TOKEN: 'token' }, fetcher: (async () => { asked++; return new Response('{}', { status: 500 }); }) as unknown as typeof fetch } as never;
		await expect(startConnect(deps, raindrop, 'https://caseyagollan.com', 'b')).rejects.toThrow('only lets apps it has approved');
		expect(asked).toBe(0);
		const listed = await connections(deps);
		expect(listed.find((one) => one.id === 'raindrop')).toMatchObject({ signIn: false, connected: false, via: 'token' });
		expect(listed.find((one) => one.id === 'readwise')).toMatchObject({ signIn: true });
	});
});

describe('listing a token-only server’s tools for /account', () => {
	test('a missing list is fetched once, and a refused token is said plainly', async () => {
		const { MCP_SERVERS } = await import('../src/lib/mcp-servers');
		const { connections, listMissingTools, listingProblem } = await import('../src/lib/server/mcp/connections');
		const { McpAuthError } = await import('../src/lib/server/mcp/client');
		const raindrop = MCP_SERVERS.find((server) => server.id === 'raindrop')!;
		const store = new Map<string, string>();
		const bucket = { get: async (key: string) => store.has(key) ? { text: async () => store.get(key)!, json: async () => JSON.parse(store.get(key)!) } : null, put: async (key: string, value: string) => { store.set(key, value); }, delete: async (key: string) => { store.delete(key); }, list: async () => ({ objects: [] }) };
		let calls = 0;
		const fetcher = (async (_url: string, init: RequestInit) => {
			calls++;
			const sent = JSON.parse(String(init.body)) as { id?: number; method: string };
			if (sent.id === undefined) return new Response(null, { status: 202 });
			const result = sent.method === 'tools/list' ? { tools: [{ name: 'find_bookmarks' }, { name: 'create_bookmarks' }] } : { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'r', version: '1' } };
			return Response.json({ jsonrpc: '2.0', id: sent.id, result });
		}) as unknown as typeof fetch;
		const deps = { bucket, env: { RAINDROP_TOKEN: 'token' }, fetcher } as never;
		await listMissingTools(deps);
		expect((await connections(deps)).find((one) => one.id === 'raindrop')?.tools).toEqual([{ name: 'find_bookmarks', reads: true }, { name: 'create_bookmarks', reads: false }]);
		const before = calls;
		await listMissingTools(deps);
		expect(calls).toBe(before);
		expect(listingProblem(raindrop, new McpAuthError(), deps)).toContain('refused the access token saved with the site');
		expect(listingProblem(raindrop, new Error('The server answered 500.'), deps)).toBe('Raindrop didn’t list its tools: The server answered 500.');
	});
});
