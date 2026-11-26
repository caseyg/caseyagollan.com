import type { RequestHandler } from './$types';
import { mcpServer, type McpConnectionsState } from '$lib/mcp-servers';
import { connections, disconnect, McpConnectError, mcpDeps, refreshTools, setWrites, startConnect } from '$lib/server/mcp/connections';
import { bindingCookie, PRIVATE } from '$lib/server/mcp/routes';
import { ProtocolError } from '$lib/server/publishing/auth';
import { randomToken } from '$lib/server/publishing/dpop';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

export const prerender = false;

/** How the chat's MCP servers (Readwise, Are.na, Raindrop) are connected. Owner only; never returns tokens. */
export const GET: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return Response.json({ error: 'Sign in to see connections.' }, { status: 401, headers: PRIVATE });
	const deps = mcpDeps(env);
	if (!deps) return Response.json({ configured: false, connections: [] } satisfies McpConnectionsState, { headers: PRIVATE });
	return Response.json({ configured: true, connections: await connections(deps) } satisfies McpConnectionsState, { headers: PRIVATE });
};

/**
 * `{ action, server }`: `connect` answers with the server's sign-in page to open; `disconnect`
 * forgets the sign-in; `refresh` asks the server for its tools again; `writes` (with `value`)
 * sets whether the chat may use the tools that change things.
 */
export const POST: RequestHandler = async ({ request, platform, url }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	try {
		await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
	} catch (cause) {
		if (cause instanceof ProtocolError) return Response.json({ error: cause.message }, { status: cause.status, headers: PRIVATE });
		throw cause;
	}
	const deps = mcpDeps(env);
	if (!deps) return Response.json({ error: 'Connections need the site’s private storage, which isn’t set up here.' }, { status: 503, headers: PRIVATE });
	const body = await request.json().catch(() => ({})) as { action?: string; server?: string; value?: unknown };
	const server = mcpServer(body.server);
	if (!server) return Response.json({ error: 'Unknown service.' }, { status: 400, headers: PRIVATE });
	const state = async (): Promise<McpConnectionsState> => ({ configured: true, connections: await connections(deps) });
	try {
		if (body.action === 'connect') {
			const binding = randomToken();
			const redirect = await startConnect(deps, server, url.origin, binding);
			return Response.json({ redirect }, { headers: { ...PRIVATE, 'set-cookie': bindingCookie(binding) } });
		}
		if (body.action === 'disconnect') await disconnect(deps, server);
		else if (body.action === 'writes') await setWrites(deps, server, body.value === true);
		else if (body.action === 'refresh') await refreshTools(deps, server).catch(() => { throw new McpConnectError(`${server.name} didn’t answer. Try again in a moment.`); });
		else return Response.json({ error: 'Unknown action.' }, { status: 400, headers: PRIVATE });
		return Response.json(await state(), { headers: PRIVATE });
	} catch (cause) {
		if (cause instanceof McpConnectError) return Response.json({ ...(await state().catch(() => ({}))), error: cause.message }, { status: 502, headers: PRIVATE });
		throw cause;
	}
};
