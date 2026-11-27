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
 *   address). A table is read as last saved, unless it is open on a canvas.
 * - Changing a table needs a canvas to do the work (it measures and lays out). In a client that
 *   draws MCP Apps, `table_open` shows the table as a live canvas (`TABLE_VIEW`, the bundle in
 *   `src/mcp-app/`), and the chat's table tools reach it through the table's thread
 *   (`../chat/remote-canvas.ts`). The view has no cookies and no socket: it loads, saves and asks
 *   for its changes with the `table_view_*` tools, which only it can call.
 */
import { chatExtension, type ThreadHooks, type ToolDeps } from '../chat/tools';
import type { MicropubCall } from '../chat/micropub-mcp';
import { MCP_RESOURCE_PATH, MCP_SCOPES } from '../indieauth/contracts';
import { listTables, readTable, writeTable } from '../tables';
import { passLink } from '../table-pass';
import type { ChatThreadStub } from '../chat/threads';
import { itemsFromDocument, tableListing, tableThreadId, type TableItem, type TableOp } from '../../table-agent';
import { cleanName, emptyTable, summarizeDocument, validDocument, validId, type Table, type TableSummary } from '../../tables';
import { MCP_APP_MIME, MCP_CORS, mcpUnauthorized, serveMcp, type McpContent, type McpResource, type McpServerInfo, type McpTool } from './server';

/** Where the server lives, and so the `resource` its tokens are for. */
export const SITE_MCP_PATH = MCP_RESOURCE_PATH;
/** The scope every call needs: the server reads Casey's drafts, draft tables and private saves. */
export const SITE_MCP_SCOPE = 'read';
/** What a client is told it can ask for; Casey ticks which of them to grant when approving it. */
export const SITE_MCP_SCOPES: readonly string[] = MCP_SCOPES;

/** The page `table_open` is shown in. */
export const TABLE_VIEW = 'ui://caseyagollan/table.html';

/**
 * The chat tools offered, with the title a client shows and whether each only reads. `canvas`:
 * it works on an open canvas, so it is offered only to a client that can show one.
 */
const OFFERED: Record<string, { title: string; reads: boolean; canvas?: boolean }> = {
	search_site: { title: 'Search the site', reads: true },
	fetch_page: { title: 'Read a page', reads: true },
	view_image: { title: 'Look at a picture', reads: true },
	my_saves: { title: 'Casey’s saves', reads: true },
	micropub_list_posts: { title: 'List posts and drafts', reads: true },
	micropub_get_post: { title: 'Read a post’s source', reads: true },
	micropub_create_post: { title: 'Create a post', reads: false },
	micropub_update_post: { title: 'Update a post', reads: false },
	table_read: { title: 'Read a table', reads: true },
	table_add: { title: 'Add to a table', reads: false, canvas: true },
	table_arrange: { title: 'Arrange a table', reads: false, canvas: true },
	table_move: { title: 'Move things on a table', reads: false, canvas: true },
	table_connect: { title: 'Draw arrows on a table', reads: false, canvas: true },
	table_group: { title: 'Group things on a table', reads: false, canvas: true },
	table_edit: { title: 'Edit things on a table', reads: false, canvas: true },
	table_draw: { title: 'Draw on a table', reads: false, canvas: true },
	table_select: { title: 'Select things on a table', reads: true, canvas: true },
	table_look: { title: 'Look at a table', reads: true, canvas: true }
};

const TABLE_ARG = { type: 'string', description: 'Which table: its id, its name, or its address (/tables/<id>). table_list gives them.' };

export interface SiteMcpDeps {
	env: ToolDeps['env'] & { PUBLISHING_STATE?: R2Bucket };
	origin: string;
	/** Micropub with the caller's own token. */
	micropub: MicropubCall;
	now?: () => Date;
	savesFetch?: typeof fetch;
	/**
	 * What Casey let this connection do. Reading needs none of these; changing a table needs `update`
	 * and making one `create`, the same permissions posts ask for.
	 */
	scopes?: readonly string[];
	/** A chat thread by id; a table's own thread is where its canvas inside Claude is reached. */
	thread?: (id: string) => Pick<ChatThreadStub, 'viewAttach' | 'viewNext' | 'viewDone' | 'viewOpen' | 'viewOp'> | undefined;
	/** The file names of the view's script and stylesheet, as the build wrote them; unset where it wasn't built. */
	viewAssets?: () => Promise<{ js: string; css?: string } | null>;
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

/** What a chat thread does for the tools, for a caller with no chat: one table, on its canvas inside Claude when that is open, else as last saved. */
function tableHooks(deps: SiteMcpDeps, table: TableSummary | undefined): ThreadHooks {
	const canvas = table ? deps.thread?.(tableThreadId(table.id)) : undefined;
	const never = async (): Promise<never> => { throw new Error('That isn’t available here.'); };
	return {
		table: () => table?.id,
		async tableOp(op: TableOp) {
			if (!canvas) throw new Error('Tables can’t be changed here.');
			return canvas.viewOp(op);
		},
		async readTable() {
			if (canvas && await canvas.viewOpen().catch(() => false)) return canvas.viewOp({ op: 'read' });
			const saved = table && await readTable(deps.env.PUBLISHING_STATE, table.id);
			if (!saved) throw new Error('That table couldn’t be read.');
			return { name: saved.name, url: `${deps.origin}/tables/${saved.id}`, ...(saved.published === false ? { draft: true } : {}), items: itemsFromDocument(saved.document), note: 'As last saved.' };
		},
		createTable: never,
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
	thread: tableHooks(deps, table),
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
	description: 'Casey’s tables (canvases of posts, books, links and notes), newest first, drafts included: each one’s id, name, address, how many blocks it holds and when it changed. Read one with table_read; for a link Casey can open without signing in, use table_link.',
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

/** Refuses a change the connection wasn't given the permission for. */
function allowed(deps: SiteMcpDeps, scope: 'create' | 'update') {
	if (!deps.scopes?.includes(scope)) throw new Error(`Casey didn’t give this connection permission to ${scope === 'create' ? 'make tables' : 'change tables'}. It can be reconnected with more permissions.`);
}

/**
 * A table's address for Casey to open from the conversation: with a pass (`../table-pass`), so it
 * opens without the passkey, which Claude's own browser can't use. The pass lets its holder change
 * the table only where this connection may.
 */
async function tableLink(deps: SiteMcpDeps, id: string): Promise<string> {
	const bucket = deps.env.PUBLISHING_STATE;
	if (!bucket) return `${deps.origin}/tables/${id}`;
	return passLink(bucket, deps.origin, id, !!deps.scopes?.includes('update'), (deps.now?.() ?? new Date()).getTime());
}
const LINK_NOTE = 'The link opens the table on the site without signing in, for half an hour; give it to Casey as it is, and get a new one with table_link after that.';

/** A link to a table that opens without signing in, for clients that can't show the canvas and for opening the site beside it. */
const tableLinkTool = (deps: SiteMcpDeps): McpTool => ({
	name: 'table_link',
	title: 'Link to a table',
	description: 'A link Casey can open to see one of their tables on caseyagollan.com without signing in again, drafts included, and to change it there if this connection may. It works for half an hour and only for that table. Use it whenever Casey wants to open, see or edit a table in a browser; a table’s plain address asks for a passkey.',
	inputSchema: { type: 'object', properties: { table: TABLE_ARG }, required: ['table'] },
	annotations: { readOnlyHint: true },
	async call(args) {
		const table = pickTable(await listTables(deps.env.PUBLISHING_STATE), args.table);
		const url = await tableLink(deps, table.id);
		return said(`“${table.name}”: ${url}\n\n${LINK_NOTE}`, { table: { id: table.id, name: table.name, url } });
	}
});

const said = (value: unknown, structured?: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) }], ...(structured ? { structuredContent: structured } : {}) });

/** Shows a table as a live canvas in the conversation, making it first when asked for a new one. */
const tableOpen = (deps: SiteMcpDeps): McpTool => ({
	name: 'table_open',
	title: 'Open a table',
	description: 'Show one of Casey’s tables here as a live canvas Casey can use, and that the other table_* tools change while it stays open: table_add, table_arrange, table_move, table_connect, table_group, table_edit, table_draw, table_select, table_look. Give `table` for one that exists, or `new` (a name) to make an empty draft and open it. The result lists what is on it. Open a table once; opening it again replaces the earlier view.',
	inputSchema: { type: 'object', properties: { table: TABLE_ARG, new: { type: 'string', maxLength: 120, description: 'A name, to make a new empty draft table instead.' } } },
	annotations: { readOnlyHint: false, destructiveHint: false },
	_meta: { ui: { resourceUri: TABLE_VIEW }, 'ui/resourceUri': TABLE_VIEW },
	app: true,
	async call(args) {
		const bucket = deps.env.PUBLISHING_STATE;
		let table: Table | null;
		if (typeof args.new === 'string' && args.new.trim() && !args.table) {
			if (!bucket) throw new Error('Tables aren’t available here.');
			allowed(deps, 'create');
			table = emptyTable(cleanName(args.new) ?? 'Untitled table');
			await writeTable(bucket, table);
		} else table = await readTable(bucket, pickTable(await listTables(bucket), args.table).id);
		if (!table) throw new Error('That table couldn’t be read.');
		const items = itemsFromDocument(table.document);
		const url = await tableLink(deps, table.id);
		return said(
			[`“${table.name}” (${table.id}${table.published === false ? ', a draft' : ''}) is open as a canvas here. Its link is ${url} . ${LINK_NOTE}`, items.length ? tableListing(items as TableItem[], [], table.name) : 'It is empty.', 'Change it with the table_* tools, passing this table’s id.'].join('\n\n'),
			{ table: { id: table.id, name: table.name, url, draft: table.published === false } }
		);
	}
});

const VIEW_ONLY = { ui: { resourceUri: TABLE_VIEW, visibility: ['app'] } };
const VIEW_ARGS = { table: { type: 'string', description: 'The table’s id.' }, view: { type: 'string', pattern: '^[a-z0-9]{8,32}$', description: 'The view’s own id.' } };
const viewId = (value: unknown) => { if (typeof value !== 'string' || !/^[a-z0-9]{8,32}$/.test(value)) throw new Error('A view id is needed.'); return value; };

/**
 * What the table view calls for itself, through its host: it has no cookies and no socket, so this
 * is how it loads the table, saves it, and takes the changes the table tools ask of it. Marked for
 * the app alone, so a model is never offered them.
 */
function viewTools(deps: SiteMcpDeps): McpTool[] {
	const canvas = (table: string) => {
		if (!validId(table)) throw new Error('No such table.');
		const thread = deps.thread?.(tableThreadId(table));
		if (!thread) throw new Error('Tables can’t be changed here.');
		return thread;
	};
	const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[], call: McpTool['call']): McpTool =>
		({ name, title: name, description: `${description} Called by the table view itself, never by a model.`, inputSchema: { type: 'object', properties: { ...VIEW_ARGS, ...properties }, required: ['table', 'view', ...required] }, _meta: VIEW_ONLY, app: true, call });
	return [
		tool('table_view_load', 'The table’s canvas, and from now on this view is the one that takes its changes.', {}, [], async (args) => {
			const table = await readTable(deps.env.PUBLISHING_STATE, String(args.table));
			if (!table) throw new Error('No such table.');
			// A connection that may not change tables gets the table to look at, and takes no changes.
			const editable = !!deps.scopes?.includes('update');
			if (editable) await canvas(table.id).viewAttach(viewId(args.view));
			return said('Loaded.', { table, editable });
		}),
		tool('table_view_save', 'Save the canvas, a new name, or both.', { document: { type: 'object' }, name: { type: 'string' } }, [], async (args) => {
			const bucket = deps.env.PUBLISHING_STATE;
			const table = await readTable(bucket, String(args.table));
			if (!bucket || !table) throw new Error('No such table.');
			allowed(deps, 'update');
			viewId(args.view);
			const next: Table = { ...table };
			if (args.name !== undefined) {
				const name = cleanName(args.name);
				if (!name) throw new Error('A table needs a name.');
				next.name = name;
			}
			if (args.document !== undefined) {
				if (!validDocument(args.document)) throw new Error('That canvas can’t be saved.');
				next.document = args.document;
				Object.assign(next, summarizeDocument(args.document));
			}
			next.updated = (deps.now?.() ?? new Date()).toISOString();
			await writeTable(bucket, next);
			return said('Saved.', { saved: next.updated, name: next.name });
		}),
		tool('table_view_link', 'A fresh link that opens the table on the site without signing in.', {}, [], async (args) => {
			if (!(await readTable(deps.env.PUBLISHING_STATE, String(args.table)))) throw new Error('No such table.');
			viewId(args.view);
			return said('ok', { url: await tableLink(deps, String(args.table)) });
		}),
		tool('table_view_next', 'Wait for the next change asked of this table.', { wait: { type: 'integer', minimum: 0, maximum: 20000 } }, [], async (args) =>
			said('ok', { ...(await canvas(String(args.table)).viewNext(viewId(args.view), typeof args.wait === 'number' ? Math.min(Math.max(args.wait, 0), 20_000) : undefined)) })),
		tool('table_view_done', 'Report on a change this view was given.', { id: { type: 'string' }, ok: { type: 'boolean' }, result: {}, error: { type: 'string' } }, ['id', 'ok'], async (args) => {
			const id = String(args.id);
			await canvas(String(args.table)).viewDone(viewId(args.view), args.ok === true ? { type: 'table:result', id, ok: true, result: args.result ?? null } : { type: 'table:result', id, ok: false, error: String(args.error ?? 'It didn’t work.').slice(0, 300) });
			return said('ok');
		})
	];
}

/** Where the canvas gets what it is drawn with: tldraw's icons and fonts, and the site's typeface. */
const VIEW_HOSTS = ['https://cdn.tldraw.com', 'https://use.typekit.net', 'https://p.typekit.net'];
/** Hosts whose pictures the canvas shows: the site's own, and where the things Casey saves keep theirs. */
const PICTURE_HOSTS = ['https://files.caseyagollan.com', 'https://d2w9rnfcy7mm78.cloudfront.net', 'https://images.are.na', 'https://cdn.bsky.app', 'https://video.bsky.app', 'https://rdl.ink', 'https://covers.openlibrary.org', 'https://books.google.com', 'https://images-na.ssl-images-amazon.com'];

/** The sandbox address Claude gives this server's views: the first 32 hex digits of the server address's SHA-256. */
export async function claudeViewDomain(server: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(server)));
	return `${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)}.claudemcpcontent.com`;
}

/**
 * The table view's page: a shell that loads the bundle from the site (`/mcp-app/`, built from
 * `src/mcp-app/`), since a view has no address of its own to load anything from. Everything it may
 * load or reach is named here, and nothing else gets through the host's sandbox.
 */
const tableView = (deps: SiteMcpDeps): McpResource => ({
	uri: TABLE_VIEW,
	name: 'Table',
	description: 'One of Casey’s tables as a live canvas.',
	mimeType: MCP_APP_MIME,
	async read() {
		const assets = await deps.viewAssets?.().catch(() => null);
		const at = (file: string) => `${deps.origin}/mcp-app/${file}`;
		const text = [
			'<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">', '<title>Table</title>',
			'<link rel="stylesheet" href="https://use.typekit.net/rfh8wvj.css?display=swap">',
			...(assets?.css ? [`<link rel="stylesheet" crossorigin href="${at(assets.css)}">`] : []),
			'<style>html,body{margin:0}.table-view-message{margin:0;padding:16px;font:14px system-ui,sans-serif}</style>',
			'</head>', '<body>',
			assets ? '<div id="table-view"></div>' : '<p style="font:14px system-ui;padding:16px">The table view isn’t built on this deployment.</p>',
			`<script>window.__SITE_ORIGIN__=${JSON.stringify(deps.origin)}</script>`,
			...(assets ? [`<script type="module" crossorigin src="${at(assets.js)}"></script>`] : []),
			'</body>', '</html>'
		].join('\n');
		return {
			text,
			_meta: { ui: {
				csp: { resourceDomains: [deps.origin, ...VIEW_HOSTS, ...PICTURE_HOSTS], connectDomains: [deps.origin, 'https://cdn.tldraw.com'] },
				domain: await claudeViewDomain(`${deps.origin}${SITE_MCP_PATH}`),
				prefersBorder: true
			} }
		};
	}
});

/** The site's MCP server for one request. */
export function siteMcpServer(deps: SiteMcpDeps): McpServerInfo {
	const tools = chatTools(deps).filter((tool) => Object.hasOwn(OFFERED, tool.name)).map((tool): McpTool => {
		const { title, reads, canvas } = OFFERED[tool.name];
		const onTable = tool.name.startsWith('table_');
		const schema = tool.parameters as { properties?: Record<string, unknown>; required?: string[] };
		return {
			name: tool.name, title, description: tool.description,
			inputSchema: onTable ? { ...schema, properties: { table: TABLE_ARG, ...schema.properties }, required: ['table', ...(schema.required ?? [])] } : { ...schema },
			annotations: reads ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: false },
			...(canvas ? { app: true } : {}),
			async call(args) {
				if (canvas && !reads) allowed(deps, 'update');
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
		tools: [...tools, tableList(deps), tableLinkTool(deps), tableOpen(deps), ...viewTools(deps)],
		resources: [tableView(deps)]
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
	server: (token: string, scopes: string[]) => McpServerInfo;
}): Promise<Response> {
	if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: MCP_CORS });
	const metadata = `${deps.origin}/.well-known/oauth-protected-resource${SITE_MCP_PATH}`;
	const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (!token) return mcpUnauthorized(metadata);
	if (!deps.introspect) return new Response('Not available here.', { status: 503, headers: MCP_CORS });
	const info = await deps.introspect(token);
	if (!info.active) return mcpUnauthorized(metadata, { error: 'invalid_token' });
	const scopes = (info.scope ?? '').split(/\s+/).filter(Boolean);
	if (!scopes.includes(SITE_MCP_SCOPE)) return mcpUnauthorized(metadata, { error: 'insufficient_scope', scope: SITE_MCP_SCOPE, status: 403 });
	return serveMcp(request, deps.server(token, scopes));
}
