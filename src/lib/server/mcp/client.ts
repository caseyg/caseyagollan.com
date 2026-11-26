/**
 * A small MCP client over Streamable HTTP: enough to list a server's tools and call them.
 * Each request is one POST; the answer comes back as JSON or as a short event stream.
 * No SDK: the Worker needs three methods, and the chat's Durable Object should stay light.
 */
export const MCP_CLIENT_PROTOCOL = '2025-06-18';
const CLIENT_INFO = { name: 'caseyagollan.com', version: '1.0.0' };
/** The most of one answer that is read, so a huge result cannot exhaust the Worker. */
const MAX_BODY = 2_000_000;
const TIMEOUT = 45_000;

export interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string };
}

export interface McpToolResult {
	/** The result's text parts joined; structured content as JSON when there is no text. */
	text: string;
	images: { data: string; mimeType: string }[];
	isError: boolean;
}

/** The server refused the token: sign in again. */
export class McpAuthError extends Error {
	constructor(message = 'The server refused the sign-in.') { super(message); this.name = 'McpAuthError'; }
}
export class McpError extends Error {
	constructor(message: string, readonly status?: number) { super(message); this.name = 'McpError'; }
}

interface RpcReply { jsonrpc?: string; id?: number | string | null; result?: unknown; error?: { code?: number; message?: string } }

async function readBody(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return '';
	const decoder = new TextDecoder();
	let text = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value, { stream: true });
		if (text.length > MAX_BODY) { await reader.cancel().catch(() => undefined); throw new McpError('The server’s answer was too large.'); }
	}
	return text + decoder.decode();
}

/** The reply to request `id` in a body that is JSON or `text/event-stream`. */
export function replyFrom(body: string, contentType: string, id: number): RpcReply | undefined {
	const candidates: unknown[] = [];
	if (/text\/event-stream/i.test(contentType)) {
		for (const event of body.split(/\r?\n\r?\n/)) {
			const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n');
			if (!data) continue;
			try { candidates.push(JSON.parse(data)); } catch { /* a keep-alive or partial event */ }
		}
	} else {
		try { candidates.push(JSON.parse(body)); } catch { return undefined; }
	}
	const replies = candidates.flatMap((value) => Array.isArray(value) ? value : [value]) as RpcReply[];
	return replies.find((reply) => reply && typeof reply === 'object' && reply.id === id && ('result' in reply || 'error' in reply));
}

/**
 * One conversation with a server. It introduces itself once (`initialize`), keeps the session
 * id the server hands out, and starts over if the server forgets it.
 */
export class McpSession {
	#id = 0;
	#session?: string;
	#ready?: Promise<void>;

	constructor(
		readonly url: string,
		/** The bearer token for each request, fetched fresh so a refresh is picked up. */
		private readonly token: () => Promise<string>,
		private readonly fetcher: typeof fetch = fetch
	) {}

	private async post(message: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
		const timeout = AbortSignal.timeout(TIMEOUT);
		return this.fetcher(this.url, {
			method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
			headers: {
				'content-type': 'application/json', accept: 'application/json, text/event-stream',
				authorization: `Bearer ${await this.token()}`, 'mcp-protocol-version': MCP_CLIENT_PROTOCOL,
				...(this.#session ? { 'mcp-session-id': this.#session } : {})
			},
			body: JSON.stringify(message)
		});
	}

	private async rpc(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
		const id = ++this.#id;
		const response = await this.post({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }, signal);
		if (response.status === 401 || response.status === 403) { await response.body?.cancel().catch(() => undefined); throw new McpAuthError(); }
		const session = response.headers.get('mcp-session-id');
		if (session) this.#session = session;
		const body = await readBody(response);
		const reply = replyFrom(body, response.headers.get('content-type') ?? '', id);
		if (!reply) throw new McpError(response.ok ? 'The server’s answer could not be read.' : `The server answered ${response.status}.`, response.status);
		if (reply.error) throw new McpError(String(reply.error.message ?? 'The server reported an error.').slice(0, 500), response.status);
		return reply.result;
	}

	private ready(signal?: AbortSignal): Promise<void> {
		this.#ready ??= (async () => {
			await this.rpc('initialize', { protocolVersion: MCP_CLIENT_PROTOCOL, capabilities: {}, clientInfo: CLIENT_INFO }, signal);
			// A notification: no reply is owed, and a server without sessions may refuse it.
			await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, signal).then((response) => response.body?.cancel()).catch(() => undefined);
		})().catch((error) => { this.#ready = undefined; throw error; });
		return this.#ready;
	}

	/** A request, after the introduction; once more from the start if the server dropped the session. */
	private async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
		await this.ready(signal);
		try { return await this.rpc(method, params, signal); } catch (error) {
			if (!(error instanceof McpError) || !this.#session || (error.status !== 404 && error.status !== 400)) throw error;
			this.#session = undefined;
			this.#ready = undefined;
			await this.ready(signal);
			return this.rpc(method, params, signal);
		}
	}

	/** Every tool the server offers, following its pages. */
	async listTools(signal?: AbortSignal): Promise<McpTool[]> {
		const tools: McpTool[] = [];
		let cursor: string | undefined;
		for (let page = 0; page < 20; page++) {
			const result = await this.request('tools/list', cursor ? { cursor } : {}, signal) as { tools?: McpTool[]; nextCursor?: string } | undefined;
			for (const tool of result?.tools ?? []) if (tool && typeof tool.name === 'string' && tool.name) tools.push(tool);
			cursor = result?.nextCursor || undefined;
			if (!cursor) break;
		}
		return tools;
	}

	async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpToolResult> {
		const result = await this.request('tools/call', { name, arguments: args }, signal) as { content?: { type?: string; text?: string; data?: string; mimeType?: string; resource?: { text?: string } }[]; structuredContent?: unknown; isError?: boolean } | undefined;
		const parts = result?.content ?? [];
		const words = parts.map((part) => part.type === 'text' ? part.text ?? '' : part.type === 'resource' ? part.resource?.text ?? '' : '').filter(Boolean).join('\n');
		return {
			text: words || (result?.structuredContent !== undefined ? JSON.stringify(result.structuredContent) : ''),
			images: parts.filter((part) => part.type === 'image' && typeof part.data === 'string' && typeof part.mimeType === 'string').map((part) => ({ data: part.data!, mimeType: part.mimeType! })),
			isError: result?.isError === true
		};
	}
}

const READ_NAME = /^(get|list|search|find|read|fetch|lookup|query|describe|count|export|view|show|check|whoami|me)([_A-Z-]|$)|(^|[_-])(get|list|search|find|read|fetch)([_-]|$)|(Digest|_digest|Summary|_summary)$/;
const WRITE_VERBS = 'create|add|update|delete|remove|save|move|connect|disconnect|set|edit|post|put|patch|upload|archive|tag|merge|import';
const WRITE_NAME = new RegExp(`(^|[_-])(${WRITE_VERBS})([_A-Z-]|$)|(${WRITE_VERBS.split('|').map((verb) => verb[0].toUpperCase() + verb.slice(1)).join('|')})([A-Z_-]|$)`);

/**
 * Whether a tool only reads. The server's own word (`readOnlyHint`) decides when it gives one;
 * otherwise the name does, and anything unclear counts as changing something.
 */
export function readsOnly(tool: McpTool): boolean {
	if (typeof tool.annotations?.readOnlyHint === 'boolean') return tool.annotations.readOnlyHint;
	if (WRITE_NAME.test(tool.name)) return false;
	return READ_NAME.test(tool.name);
}
