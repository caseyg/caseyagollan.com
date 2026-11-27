/**
 * A small MCP server (https://modelcontextprotocol.io/) over Streamable HTTP with JSON
 * responses and no session: each POST is answered on its own, which is all a tools-only
 * server needs and what Workers do best. `/mcp` (the whole site, `site.ts`) is built on it.
 */

/** The protocol versions this server speaks, newest first. */
export const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

export type McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export interface McpToolResult { content: McpContent[]; isError?: boolean; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> }

export interface McpTool {
	name: string;
	title?: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: Record<string, boolean | string>;
	_meta?: Record<string, unknown>;
	/** Only for a client that draws MCP Apps: a tool that opens a view, or one a view calls itself. */
	app?: boolean;
	call(args: Record<string, unknown>): Promise<McpToolResult>;
}

/** The MCP Apps extension (https://github.com/modelcontextprotocol/ext-apps): a client that draws views says so under this key. */
export const MCP_APPS_EXTENSION = 'io.modelcontextprotocol/ui';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';

/** A `ui://` page a tool's result is shown in. */
export interface McpResource {
	uri: string;
	name: string;
	description?: string;
	mimeType: string;
	read(): Promise<{ text: string; _meta?: Record<string, unknown> }>;
}

export interface McpServerInfo {
	name: string;
	title?: string;
	version: string;
	instructions?: string;
	tools: McpTool[];
	resources?: McpResource[];
}

/** What is known of the client from its `initialize`, carried in the session id it sends back. */
export interface McpClient {
	/** Whether it draws MCP Apps. Unknown counts as yes: a view left out is worse than a tool too many. */
	apps: boolean;
}

const SESSION = /^(a|t)\.[A-Za-z0-9_-]{8,64}$/;
/** The server keeps nothing between requests, so the session id itself says what kind of client it is. */
export const mcpSession = (client: McpClient) => `${client.apps ? 'a' : 't'}.${crypto.randomUUID().replaceAll('-', '')}`;
export const mcpClient = (session: string | null): McpClient => ({ apps: !(session && SESSION.test(session) && session.startsWith('t.')) });
/** Whether an `initialize` came from a client that draws MCP Apps. */
export function drawsApps(params: Record<string, unknown> | undefined): boolean {
	const extensions = (params?.capabilities as { extensions?: Record<string, { mimeTypes?: unknown }> } | undefined)?.extensions;
	const types = extensions?.[MCP_APPS_EXTENSION]?.mimeTypes;
	return Array.isArray(types) && types.includes(MCP_APP_MIME);
}

type JsonRpcId = string | number | null;
interface JsonRpcRequest { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: Record<string, unknown> }

/** Answer one JSON-RPC message; notifications (no id) get no answer. */
export async function answerMcp(server: McpServerInfo, message: unknown, client: McpClient = { apps: true }): Promise<Record<string, unknown> | undefined> {
	const request = message as JsonRpcRequest;
	const id = request && typeof request === 'object' && 'id' in request ? request.id ?? null : undefined;
	const error = (code: number, text: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message: text } });
	if (!request || typeof request !== 'object' || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return error(-32600, 'Invalid request');
	if (id === undefined) return undefined;
	const result = (value: unknown) => ({ jsonrpc: '2.0', id, result: value });
	const tools = client.apps ? server.tools : server.tools.filter((tool) => !tool.app);
	const resources = client.apps ? server.resources ?? [] : [];
	switch (request.method) {
		case 'initialize': {
			const asked = request.params?.protocolVersion;
			return result({
				protocolVersion: MCP_VERSIONS.find((version) => version === asked) ?? MCP_VERSIONS[0],
				capabilities: { tools: { listChanged: false }, ...(server.resources?.length ? { resources: {} } : {}) },
				serverInfo: { name: server.name, ...(server.title ? { title: server.title } : {}), version: server.version },
				...(server.instructions ? { instructions: server.instructions } : {})
			});
		}
		case 'ping': return result({});
		case 'tools/list':
			return result({ tools: tools.map(({ call: _call, app: _app, ...tool }) => tool) });
		case 'resources/list':
			return result({ resources: resources.map(({ read: _read, ...resource }) => resource) });
		case 'resources/templates/list':
			return result({ resourceTemplates: [] });
		case 'resources/read': {
			const resource = resources.find((one) => one.uri === request.params?.uri);
			if (!resource) return error(-32002, 'Resource not found');
			const { text, _meta } = await resource.read();
			return result({ contents: [{ uri: resource.uri, mimeType: resource.mimeType, text, ...(_meta ? { _meta } : {}) }] });
		}
		case 'tools/call': {
			const tool = tools.find((one) => one.name === request.params?.name);
			if (!tool) return error(-32602, 'Unknown tool');
			const args = request.params?.arguments;
			try {
				return result(await tool.call(args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {}));
			} catch (failure) {
				// A tool's own failure is its answer, for the model to act on; it is not a protocol error.
				return result({ content: [{ type: 'text', text: String((failure as Error)?.message ?? failure).slice(0, 2000) }], isError: true });
			}
		}
	}
	return error(-32601, 'Method not found');
}

export const MCP_CORS = {
	'cache-control': 'no-store',
	'access-control-allow-origin': '*',
	'access-control-allow-headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
	'access-control-allow-methods': 'POST, OPTIONS',
	'access-control-expose-headers': 'Mcp-Session-Id, WWW-Authenticate'
};

/**
 * What a client without a usable token is told: where to read how to sign in
 * (RFC 9728, the way MCP clients find the authorization server).
 */
export function mcpUnauthorized(resourceMetadata: string, problem?: { error: 'invalid_token' | 'insufficient_scope'; scope?: string; status?: number }): Response {
	const challenge = [`Bearer resource_metadata="${resourceMetadata}"`, ...(problem ? [`error="${problem.error}"`] : []), ...(problem?.scope ? [`scope="${problem.scope}"`] : [])].join(', ');
	return Response.json(
		{ jsonrpc: '2.0', id: null, error: { code: -32001, message: problem?.error === 'insufficient_scope' ? `This needs the ${problem.scope} scope.` : 'Sign in to caseyagollan.com to use this.' } },
		{ status: problem?.status ?? 401, headers: { ...MCP_CORS, 'www-authenticate': challenge } }
	);
}

/** The HTTP transport: POST a JSON-RPC message (or batch) and get JSON back. */
export async function serveMcp(request: Request, server: McpServerInfo): Promise<Response> {
	if (request.method !== 'POST') return new Response('Use POST with a JSON-RPC message.', { status: 405, headers: { ...MCP_CORS, allow: 'POST, OPTIONS' } });
	// Roomy enough for a table's whole canvas, which its view inside Claude saves through a tool call.
	if (Number(request.headers.get('content-length')) > 8 * 1024 * 1024) return new Response('Too large', { status: 413, headers: MCP_CORS });
	let message: unknown;
	try { message = await request.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers: MCP_CORS }); }
	const client = mcpClient(request.headers.get('mcp-session-id'));
	const answers = Array.isArray(message)
		? (await Promise.all(message.slice(0, 20).map((item) => answerMcp(server, item, client)))).filter(Boolean)
		: await answerMcp(server, message, client);
	if (!answers || (Array.isArray(answers) && !answers.length)) return new Response(null, { status: 202, headers: MCP_CORS });
	// A client's first message says whether it draws views; its session id remembers that for it.
	const first = !Array.isArray(message) && (message as { method?: unknown } | null)?.method === 'initialize' ? (message as { params?: Record<string, unknown> }).params : undefined;
	if (first) {
		const apps = drawsApps(first);
		console.log(JSON.stringify({ event: 'mcp_initialize', client: String((first.clientInfo as { name?: unknown } | undefined)?.name ?? '').slice(0, 60), version: String(first.protocolVersion ?? '').slice(0, 20), apps, extensions: Object.keys((first.capabilities as { extensions?: object } | undefined)?.extensions ?? {}).slice(0, 8) }));
		return Response.json(answers, { headers: { ...MCP_CORS, 'mcp-session-id': mcpSession({ apps }) } });
	}
	return Response.json(answers, { headers: MCP_CORS });
}
