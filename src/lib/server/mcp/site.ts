/**
 * The site as an MCP server, at `/mcp`: what Casey adds to Claude as a custom connector.
 *
 * Its tools are the /chat assistant's own (`chatExtension` in `../chat/tools.ts`), taken as
 * they are: the same names, descriptions, schemas and code, so a change to a chat tool is a
 * change here. Only what a chat thread gives them is different:
 * - Everything is Casey's: the caller holds an IndieAuth token Casey approved, with `read`.
 * - Posts go through Micropub with the caller's own token, so its scopes decide what it may
 *   write (`create`, `draft`, `update`), exactly as for any Micropub client.
 * - There is no table open beside a chat, so table tools take a `table` (its id, name or
 *   address) and read it as last saved. Tools that change a table need a canvas to do the
 *   work, and stay out until the table view inside Claude exists.
 */
import { chatExtension, type ThreadHooks, type ToolDeps } from '../chat/tools';
import type { MicropubCall } from '../chat/micropub-mcp';
import { MCP_RESOURCE_PATH, MCP_SCOPES } from '../indieauth/contracts';
import { listTables, readTable } from '../tables';
import { itemsFromDocument } from '../../table-agent';
import { validId, type TableSummary } from '../../tables';
import { MCP_CORS, mcpUnauthorized, serveMcp, type McpContent, type McpServerInfo, type McpTool } from './server';

/** Where the server lives, and so the `resource` its tokens are for. */
export const SITE_MCP_PATH = MCP_RESOURCE_PATH;
/** The scope every call needs: the server reads Casey's drafts, draft tables and private saves. */
export const SITE_MCP_SCOPE = 'read';
/** What a client is told it can ask for; Casey ticks which of them to grant when approving it. */
export const SITE_MCP_SCOPES: readonly string[] = MCP_SCOPES;

/** The chat tools offered, with the title a client shows and whether each only reads. */
const OFFERED: Record<string, { title: string; reads: boolean }> = {
	search_site: { title: 'Search the site', reads: true },
	fetch_page: { title: 'Read a page', reads: true },
	view_image: { title: 'Look at a picture', reads: true },
	my_saves: { title: 'Casey’s saves', reads: true },
	micropub_list_posts: { title: 'List posts and drafts', reads: true },
	micropub_get_post: { title: 'Read a post’s source', reads: true },
	micropub_create_post: { title: 'Create a post', reads: false },
	micropub_update_post: { title: 'Update a post', reads: false },
	table_read: { title: 'Read a table', reads: true }
};

const TABLE_ARG = { type: 'string', description: 'Which table: its id, its name, or its address (/tables/<id>). table_list gives them.' };

export interface SiteMcpDeps {
	env: ToolDeps['env'] & { PUBLISHING_STATE?: R2Bucket };
	origin: string;
	/** Micropub with the caller's own token. */
	micropub: MicropubCall;
	now?: () => Date;
	savesFetch?: typeof fetch;
}

/** The table a caller named, by id, address or name. */
export function pickTable(tables: TableSummary[], asked: unknown): TableSummary {
	const wanted = typeof asked === 'string' ? asked.trim() : '';
	if (!wanted) throw new Error('Say which `table`: its id, name or address. table_list gives them.');
	const id = /\/tables\/([a-z0-9-]+)/.exec(wanted)?.[1] ?? (validId(wanted) ? wanted : undefined);
	const name = wanted.toLowerCase();
	const found = (id && tables.find((table) => table.id === id)) || tables.find((table) => table.name.toLowerCase() === name) || tables.filter((table) => table.name.toLowerCase().includes(name));
	const one = Array.isArray(found) ? (found.length === 1 ? found[0] : undefined) : found;
	if (one) return one;
	throw new Error(Array.isArray(found) && found.length > 1
		? `More than one table matches “${wanted}”: ${found.slice(0, 8).map((table) => `${table.name} (${table.id})`).join(', ')}. Give the id.`
		: `There’s no table “${wanted}”. table_list gives the ones there are.`);
}

/** What a chat thread does for the tools, for a caller with no chat: one saved table, read only. */
function savedTable(deps: SiteMcpDeps, table: TableSummary | undefined): ThreadHooks {
	const closed = async (): Promise<never> => { throw new Error('This table isn’t open on a canvas here, so it can be read but not changed.'); };
	return {
		table: () => table?.id,
		tableOp: closed,
		async readTable() {
			const saved = table && await readTable(deps.env.PUBLISHING_STATE, table.id);
			if (!saved) throw new Error('That table couldn’t be read.');
			return { name: saved.name, url: `${deps.origin}/tables/${saved.id}`, ...(saved.published === false ? { draft: true } : {}), items: itemsFromDocument(saved.document), note: 'As last saved.' };
		},
		createTable: closed,
		navigate: async () => false,
		tableOpened: async () => false,
		selection: () => []
	};
}

const chatTools = (deps: SiteMcpDeps, table?: TableSummary) => chatExtension({
	env: deps.env,
	origin: () => deps.origin,
	onlyOwner: () => true,
	now: deps.now,
	savesFetch: deps.savesFetch,
	thread: savedTable(deps, table),
	// A refusal from Micropub (a missing scope, an unknown post) is the tool's answer.
	micropub: async (query, init) => {
		const response = await deps.micropub(query, init);
		if (response.ok) return response;
		const body = await response.clone().json().catch(() => ({})) as { error?: string; error_description?: string };
		throw new Error(body.error === 'insufficient_scope'
			? 'Casey didn’t give this connection permission to do that. It can be reconnected with more permissions.'
			: [body.error, body.error_description].filter(Boolean).join(': ') || `Micropub answered ${response.status}.`);
	}
}).tools ?? [];

const tableList = (deps: SiteMcpDeps): McpTool => ({
	name: 'table_list',
	title: 'List tables',
	description: 'Casey’s tables (canvases of posts, books, links and notes), newest first, drafts included: each one’s id, name, address, how many blocks it holds and when it changed. Read one with table_read.',
	inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Only tables whose name has these words.' } } },
	annotations: { readOnlyHint: true },
	async call(args) {
		const words = typeof args.query === 'string' ? args.query.toLowerCase().split(/\s+/).filter(Boolean) : [];
		const tables = (await listTables(deps.env.PUBLISHING_STATE)).filter((table) => words.every((word) => table.name.toLowerCase().includes(word)));
		return {
			content: [{
				type: 'text', text: JSON.stringify({
					total: tables.length,
					tables: tables.slice(0, 100).map((table) => ({ id: table.id, name: table.name, url: `${deps.origin}/tables/${table.id}`, ...(table.published === false ? { draft: true } : {}), blocks: table.count, updated: table.updated })),
					...(tables.length > 100 ? { note: 'The first 100. Narrow it with `query`.' } : {})
				})
			}]
		};
	}
});

/** The site's MCP server for one request. */
export function siteMcpServer(deps: SiteMcpDeps): McpServerInfo {
	const tools = chatTools(deps).filter((tool) => Object.hasOwn(OFFERED, tool.name)).map((tool): McpTool => {
		const { title, reads } = OFFERED[tool.name];
		const onTable = tool.name.startsWith('table_');
		const schema = tool.parameters as { properties?: Record<string, unknown>; required?: string[] };
		return {
			name: tool.name, title, description: tool.description,
			inputSchema: onTable ? { ...schema, properties: { table: TABLE_ARG, ...schema.properties }, required: ['table', ...(schema.required ?? [])] } : { ...schema },
			annotations: reads ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: false },
			async call(args) {
				const { table, ...rest } = args;
				// Built again for a table tool, so the code the chat runs sees that table as the one open.
				const run = onTable ? chatTools(deps, pickTable(await listTables(deps.env.PUBLISHING_STATE), table)).find((one) => one.name === tool.name)! : tool;
				const result = await (run.execute as (args: unknown, ...more: unknown[]) => Promise<{ output?: unknown }>)(onTable ? rest : args, undefined, undefined);
				const output = Array.isArray(result?.output) ? result.output as McpContent[] : [];
				return { content: output.length ? output.filter((part) => part.type === 'text' || part.type === 'image') : [{ type: 'text', text: 'Done.' }] };
			}
		};
	});
	return {
		name: 'caseyagollan', title: 'caseyagollan.com', version: '0.1.0',
		instructions: 'Casey Gollan’s website, caseyagollan.com, used as Casey: posts (notes, articles, photos, replies, bookmarks, likes), the library’s books, wiki pages, saves on Are.na, Raindrop and Readwise, and tables (canvases of all of these). Find things with search_site and read them with fetch_page. Posts are Markdown; create drafts unless Casey asks to publish.',
		tools: [...tools, tableList(deps)]
	};
}

/**
 * One request to `/mcp`: only a live token Casey approved with `read` gets past this. Anyone
 * else is pointed at the protected resource metadata, which is how an MCP client learns to sign in.
 */
export async function handleSiteMcp(request: Request, deps: {
	origin: string;
	/** Looks a token up in the IndieAuth store; undefined where there is none (a preview without one). */
	introspect?: (token: string) => Promise<{ active: boolean; scope?: string }>;
	server: (token: string) => McpServerInfo;
}): Promise<Response> {
	if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: MCP_CORS });
	const metadata = `${deps.origin}/.well-known/oauth-protected-resource${SITE_MCP_PATH}`;
	const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (!token) return mcpUnauthorized(metadata);
	if (!deps.introspect) return new Response('Not available here.', { status: 503, headers: MCP_CORS });
	const info = await deps.introspect(token);
	if (!info.active) return mcpUnauthorized(metadata, { error: 'invalid_token' });
	if (!(info.scope ?? '').split(/\s+/).includes(SITE_MCP_SCOPE)) return mcpUnauthorized(metadata, { error: 'insufficient_scope', scope: SITE_MCP_SCOPE, status: 403 });
	return serveMcp(request, deps.server(token));
}
