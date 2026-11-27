/**
 * An MCP server (https://modelcontextprotocol.io/) in front of this site's Micropub
 * endpoint. It maps a handful of tools onto Micropub requests and nothing else: every
 * call goes through the Micropub handler, which checks the token and its scopes as it
 * would for any client.
 *
 * Two ways in:
 * - `/micropub/mcp` over Streamable HTTP (JSON responses), for MCP clients holding an
 *   IndieAuth token for the site. The token is passed through to Micropub unchanged.
 * - The /chat agent, in process, only while Casey's own passkey session started the turn
 *   (`ChatThread`); it mints a one-off token accepted by that handler only (`ownerMicropub`).
 *
 * Proposal: docs/indieweb-publishing/proposals/micropub-mcp-bridge.md
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'caseyagollan-micropub', version: '0.1.0' };

/** Sends one Micropub request (query string such as `?q=config`) and returns the response. */
export type MicropubCall = (query: string, init?: RequestInit) => Promise<Response>;

interface ToolDefinition {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: Record<string, boolean>;
}

const URL_PROPERTIES = ['in-reply-to', 'like-of', 'repost-of', 'bookmark-of'] as const;

export const MICROPUB_TOOLS: ToolDefinition[] = [
	{
		name: 'micropub_config', title: 'Micropub configuration',
		description: 'Read the Micropub configuration: post types, post statuses, syndication targets and channels.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		annotations: { readOnlyHint: true }
	},
	{
		name: 'micropub_list_posts', title: 'List posts',
		description: 'List recent posts and drafts, newest first, with their URLs and properties.',
		inputSchema: {
			type: 'object',
			properties: {
				limit: { type: 'integer', minimum: 1, maximum: 50, description: 'How many posts, default 10.' },
				post_type: { type: 'string', description: 'Only this post type, such as note, article, bookmark, like, reply or photo.' },
				after: { type: 'string', description: 'The paging cursor from a previous call, for older posts.' }
			},
			additionalProperties: false
		},
		annotations: { readOnlyHint: true }
	},
	{
		name: 'micropub_get_post', title: 'Read a post',
		description: 'Read one post’s source properties (Microformats2 JSON) by its URL.',
		inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'The post’s URL on caseyagollan.com.' } }, required: ['url'], additionalProperties: false },
		annotations: { readOnlyHint: true }
	},
	{
		name: 'micropub_create_post', title: 'Create a post',
		description: 'Create a post. It is saved as a draft unless post_status is "published"; publish only when Casey explicitly asks to. Content is Markdown.',
		inputSchema: {
			type: 'object',
			properties: {
				content: { type: 'string', description: 'The post body, in Markdown.' },
				name: { type: 'string', description: 'A title, for articles. Leave out for notes.' },
				summary: { type: 'string' },
				category: { type: 'array', items: { type: 'string' }, description: 'Tags.' },
				post_status: { type: 'string', enum: ['draft', 'published'], description: 'Default draft.' },
				...Object.fromEntries(URL_PROPERTIES.map((key) => [key.replaceAll('-', '_'), { type: 'string', description: `The URL this post is a ${key.replace('-of', '').replace('in-reply-to', 'reply')} of.` }])),
				slug: { type: 'string', description: 'The address slug, such as my-post.' }
			},
			additionalProperties: false
		},
		annotations: { readOnlyHint: false, destructiveHint: false }
	},
	{
		name: 'micropub_update_post', title: 'Update a post',
		description: 'Change a post: replace properties, add values, or delete properties. Content is Markdown.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				replace: { type: 'object', description: 'Properties to replace, each a list of values, such as {"content": ["…"], "post-status": ["published"]}.', additionalProperties: { type: 'array' } },
				add: { type: 'object', description: 'Values to add, such as {"category": ["indieweb"]}.', additionalProperties: { type: 'array' } },
				delete: { type: 'array', items: { type: 'string' }, description: 'Property names to remove.' }
			},
			required: ['url'],
			additionalProperties: false
		},
		annotations: { readOnlyHint: false, destructiveHint: false }
	}
];

export class ToolInputError extends Error {}

const str = (value: unknown, name: string, max = 20_000): string | undefined => {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string' || value.length > max) throw new ToolInputError(`${name} must be text`);
	return value;
};

async function micropubResult(response: Response): Promise<{ ok: boolean; text: string }> {
	const location = response.headers.get('location');
	const body = await response.text();
	let detail = body;
	try {
		const json = JSON.parse(body) as Record<string, unknown>;
		detail = typeof json.error === 'string' ? `${json.error}: ${json.error_description ?? ''}`.trim() : JSON.stringify(json, null, 1);
	} catch { /* plain text */ }
	if (!response.ok) return { ok: false, text: `Micropub answered ${response.status}. ${detail}`.trim() };
	return { ok: true, text: [location ? `Location: ${location}` : '', detail].filter(Boolean).join('\n') || `Done (${response.status}).` };
}

/** Run one tool. Returns MCP `CallToolResult` content. */
export async function callMicropubTool(call: MicropubCall, name: string, input: Record<string, unknown> = {}): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
	const done = ({ ok, text }: { ok: boolean; text: string }) => ({ content: [{ type: 'text' as const, text: text.slice(0, 30_000) }], ...(ok ? {} : { isError: true }) });
	const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	try {
		switch (name) {
			case 'micropub_config': return done(await micropubResult(await call('?q=config')));
			case 'micropub_list_posts': {
				const query = new URLSearchParams({ q: 'source', limit: String(Math.min(Math.max(Number(input.limit) || 10, 1), 50)) });
				const type = str(input.post_type, 'post_type', 40), after = str(input.after, 'after', 400);
				if (type) query.set('post-type', type);
				if (after) query.set('after', after);
				return done(await micropubResult(await call(`?${query}`)));
			}
			case 'micropub_get_post': {
				const url = str(input.url, 'url', 2000);
				if (!url) throw new ToolInputError('url is required');
				return done(await micropubResult(await call(`?${new URLSearchParams({ q: 'source', url })}`)));
			}
			case 'micropub_create_post': {
				const properties: Record<string, unknown[]> = {};
				const content = str(input.content, 'content');
				if (content) properties.content = [content];
				for (const key of ['name', 'summary'] as const) { const value = str(input[key], key, 2000); if (value) properties[key] = [value]; }
				for (const key of URL_PROPERTIES) { const value = str(input[key.replaceAll('-', '_')], key, 2000); if (value) properties[key] = [value]; }
				if (Array.isArray(input.category)) properties.category = input.category.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim()).slice(0, 20);
				properties['post-status'] = [input.post_status === 'published' ? 'published' : 'draft'];
				if (!Object.keys(properties).some((key) => key !== 'post-status' && key !== 'category')) throw new ToolInputError('A post needs content, a name or a URL it responds to');
				const slug = str(input.slug, 'slug', 120);
				return done(await micropubResult(await call('', json({ type: ['h-entry'], properties, ...(slug ? { 'mp-slug': [slug] } : {}) }))));
			}
			case 'micropub_update_post': {
				const url = str(input.url, 'url', 2000);
				if (!url) throw new ToolInputError('url is required');
				const body: Record<string, unknown> = { action: 'update', url };
				const lists = (value: unknown, key: string) => {
					if (value === undefined) return;
					if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some((item) => !Array.isArray(item))) throw new ToolInputError(`${key} must map property names to lists`);
					body[key] = value;
				};
				lists(input.replace, 'replace');
				lists(input.add, 'add');
				if (input.delete !== undefined) {
					if (!Array.isArray(input.delete) || input.delete.some((item) => typeof item !== 'string')) throw new ToolInputError('delete must list property names');
					body.delete = input.delete;
				}
				if (!body.replace && !body.add && !body.delete) throw new ToolInputError('Say what to change');
				return done(await micropubResult(await call('', json(body))));
			}
		}
		return done({ ok: false, text: `Unknown tool ${name}` });
	} catch (error) {
		if (error instanceof ToolInputError) return done({ ok: false, text: error.message });
		throw error;
	}
}

type JsonRpcId = string | number | null;
interface JsonRpcRequest { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: Record<string, unknown> }

/** Answer one JSON-RPC message; notifications (no id) get no answer. */
export async function handleMcpMessage(call: MicropubCall, message: unknown): Promise<Record<string, unknown> | undefined> {
	const request = message as JsonRpcRequest;
	const id = request && typeof request === 'object' && 'id' in request ? request.id ?? null : undefined;
	const error = (code: number, text: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message: text } });
	if (!request || typeof request !== 'object' || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return error(-32600, 'Invalid request');
	if (id === undefined) return undefined;
	const result = (value: unknown) => ({ jsonrpc: '2.0', id, result: value });
	switch (request.method) {
		case 'initialize':
			return result({
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: { tools: { listChanged: false } },
				serverInfo: SERVER_INFO,
				instructions: 'Tools for Casey Gollan’s Micropub endpoint at caseyagollan.com. Posts are Markdown. Create drafts unless asked to publish.'
			});
		case 'ping': return result({});
		case 'tools/list': return result({ tools: MICROPUB_TOOLS });
		case 'tools/call': {
			const name = request.params?.name;
			if (typeof name !== 'string' || !MICROPUB_TOOLS.some((tool) => tool.name === name)) return error(-32602, 'Unknown tool');
			const args = request.params?.arguments;
			return result(await callMicropubTool(call, name, args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {}));
		}
	}
	return error(-32601, 'Method not found');
}

/**
 * A minimal in-process MCP client for the chat agent: it speaks the same JSON-RPC to the
 * server above, so the agent sees exactly what an outside MCP client would.
 */
export function micropubMcpClient(call: MicropubCall) {
	let next = 1;
	const request = async (method: string, params?: Record<string, unknown>) => {
		const response = await handleMcpMessage(call, { jsonrpc: '2.0', id: next++, method, ...(params ? { params } : {}) });
		if (!response || 'error' in response) throw new Error(String((response?.error as { message?: string } | undefined)?.message ?? 'MCP error'));
		return response.result as Record<string, unknown>;
	};
	return {
		async tools(): Promise<ToolDefinition[]> {
			await request('initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'caseyagollan-chat', version: '0.1.0' } });
			return (await request('tools/list')).tools as ToolDefinition[];
		},
		async call(name: string, args: Record<string, unknown>) {
			const result = await request('tools/call', { name, arguments: args }) as { content: { text: string }[]; isError?: boolean };
			return { text: result.content.map((part) => part.text).join('\n'), isError: !!result.isError };
		}
	};
}

/** The HTTP transport: POST a JSON-RPC message (or batch) and get JSON back. */
export async function handleMcpHttp(request: Request, call: MicropubCall): Promise<Response> {
	const headers = { 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id', 'access-control-allow-methods': 'POST, OPTIONS' };
	if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
	if (request.method !== 'POST') return new Response('Use POST with a JSON-RPC message.', { status: 405, headers: { ...headers, allow: 'POST, OPTIONS' } });
	if (!/^Bearer \S+$/i.test(request.headers.get('authorization') ?? '')) {
		return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Send an IndieAuth access token for caseyagollan.com as a Bearer token.' } }, { status: 401, headers: { ...headers, 'access-control-expose-headers': 'WWW-Authenticate', 'www-authenticate': `Bearer resource_metadata="${new URL(request.url).origin}/.well-known/oauth-protected-resource/micropub/mcp"` } });
	}
	if (Number(request.headers.get('content-length')) > 256 * 1024) return new Response('Too large', { status: 413, headers });
	let message: unknown;
	try { message = await request.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers }); }
	const answers = Array.isArray(message)
		? (await Promise.all(message.slice(0, 20).map((item) => handleMcpMessage(call, item)))).filter(Boolean)
		: await handleMcpMessage(call, message);
	if (!answers || (Array.isArray(answers) && !answers.length)) return new Response(null, { status: 202, headers });
	return Response.json(answers, { headers });
}
