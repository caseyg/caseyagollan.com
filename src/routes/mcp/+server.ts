import type { RequestHandler } from './$types';
import { authSettings, authStore, withPreviewOrigin } from '$lib/server/indieauth/contracts';
import { publishingConfig } from '$lib/server/publishing/config';
import { createMicropubHandler } from '$lib/server/publishing/micropub';
import { handleSiteMcp, siteMcpServer } from '$lib/server/mcp/site';
import { threadStub } from '$lib/server/chat/threads';

export const prerender = false;

/**
 * The site's MCP server, for Claude and other MCP clients (`$lib/server/mcp/site`).
 * A caller without a token is pointed at `/.well-known/oauth-protected-resource/mcp`,
 * which names this site's IndieAuth server; a token works here once Casey approved it with `read`.
 */
const handle: RequestHandler = ({ request, platform, url }) => {
	const env = platform?.env ? withPreviewOrigin(platform.env, request) : undefined;
	const store = env && authStore(env);
	// The address tokens are issued for: the site's own, whichever host the request came in on.
	const settings = env && authSettings(env);
	const origin = settings ? new URL(settings.issuer).origin : url.origin;
	return handleSiteMcp(request, {
		origin,
		introspect: store ? (token) => store.invoke('introspectToken', { token }) : undefined,
		server: (token, scopes) => {
			const micropub = createMicropubHandler(publishingConfig(env));
			return siteMcpServer({
				env: env!, origin, scopes,
				// A table's canvas inside Claude is reached through that table's own chat thread.
				thread: (id) => threadStub(env!, id),
				// Which files the build wrote for the table view; they are served from /mcp-app/.
				viewAssets: async () => {
					const response = await env!.ASSETS?.fetch(new URL('/mcp-app/manifest.json', url));
					return response?.ok ? ((await response.json()) as { js: string; css?: string }) : null;
				},
				// Micropub as the caller: its handler checks the token's scopes, as for any client.
				micropub: (query, init = {}) => micropub(new Request(new URL(`/micropub${query}`, url), { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${token}` } }))
			});
		}
	});
};

export const POST = handle;
export const OPTIONS = handle;
export const GET = handle;
export const DELETE = handle;
