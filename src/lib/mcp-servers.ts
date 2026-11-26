/**
 * The MCP servers (https://modelcontextprotocol.io/) the site's chat can use as Casey: the
 * services' own hosted servers, signed in to with OAuth from /account. Shared by the server
 * and the /account page, so nothing here is secret.
 */
export interface McpServer {
	/** Short name, used in storage keys and in tool names (`mcp__<id>__<tool>`). */
	id: string;
	name: string;
	/** The server's Streamable HTTP endpoint. */
	url: string;
	/** What the chat gets from it, for /account. */
	summary: string;
	/** What the model reads above the server's tools: when to reach for it, and its main tools. */
	guide: string;
	/** A Worker secret holding a personal token the server also accepts, used until OAuth is connected. */
	tokenSecret?: 'ARENA_PAT' | 'RAINDROP_TOKEN';
}

export const MCP_SERVERS: McpServer[] = [
	{
		id: 'readwise', name: 'Readwise', url: 'https://mcp2.readwise.io/mcp',
		summary: 'Search the full text of everything in Reader, and read highlights and documents.',
		guide: 'Casey’s Readwise: Reader documents (articles, PDFs, newsletters, with their full text) and highlights. The only way to search the words inside Reader documents.'
	},
	{
		id: 'arena', name: 'Are.na', url: 'https://mcp.are.na/mcp', tokenSecret: 'ARENA_PAT',
		summary: 'Search Are.na, read any channel or block, and see connections.',
		guide: 'Are.na: Casey’s channels and blocks (user slug casey-gollan), and everyone else’s public ones.'
	},
	{
		id: 'raindrop', name: 'Raindrop', url: 'https://api.raindrop.io/rest/v2/ai/mcp', tokenSecret: 'RAINDROP_TOKEN',
		summary: 'Search and read bookmarks, collections, tags and highlights.',
		guide: 'Casey’s Raindrop.io bookmarks, collections, tags and highlights.'
	}
];

export const mcpServer = (id: unknown): McpServer | undefined => MCP_SERVERS.find((server) => server.id === id);

/** How one server is connected, as /account shows it. Never holds a token. */
export interface McpConnection {
	id: string;
	name: string;
	summary: string;
	/** Signed in with OAuth. */
	connected: boolean;
	/** `oauth`, or `token` while a personal token in the Worker's secrets stands in. */
	via?: 'oauth' | 'token';
	connectedAt?: number;
	/** What the chat may call: every tool's name, and whether it only reads. */
	tools?: { name: string; reads: boolean }[];
	toolsAt?: number;
	/** Whether the chat may also use the tools that change things. */
	writes: boolean;
	/** Set when the server stopped accepting the sign-in; connect again. */
	broken?: { at: number; reason: string };
}

export interface McpConnectionsState {
	/** False where there is nowhere to keep a sign-in (no `PUBLISHING_STATE` bucket). */
	configured: boolean;
	connections: McpConnection[];
	error?: string;
}
