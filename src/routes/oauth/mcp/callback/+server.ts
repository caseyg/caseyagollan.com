import type { RequestHandler } from './$types';
import { finishConnect, McpConnectError, mcpDeps } from '$lib/server/mcp/connections';
import { bindingCookie, PRIVATE, readBinding } from '$lib/server/mcp/routes';
import { editorSession } from '$lib/server/publishing/syndication-editor';

export const prerender = false;

/** Where Readwise, Are.na and Raindrop send Casey back after signing in. Finishes it, then returns to /account. */
export const GET: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	const deps = mcpDeps(env);
	if (!deps) return new Response('Not found', { status: 404, headers: PRIVATE });
	const back = (result: Record<string, string>) => {
		const target = new URL('/account', url.origin);
		for (const [key, value] of Object.entries(result)) target.searchParams.set(key, value);
		target.hash = 'connections-chat';
		return new Response(null, { status: 303, headers: { ...PRIVATE, location: target.href, 'set-cookie': bindingCookie('', 0), 'referrer-policy': 'no-referrer' } });
	};
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return back({ mcp: 'error', message: 'Sign in, then connect again.' });
	try {
		const server = await finishConnect(deps, url.searchParams, readBinding(request));
		return back({ mcp: 'connected', server: server.id });
	} catch (cause) {
		const known = cause instanceof McpConnectError;
		if (!known) console.error(JSON.stringify({ event: 'mcp_oauth_callback_failed', kind: (cause as Error)?.name }));
		return back({ mcp: 'error', message: known ? cause.message.slice(0, 200) : 'That service could not be connected.' });
	}
};
