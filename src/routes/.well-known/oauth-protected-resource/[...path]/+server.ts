import type { RequestHandler } from './$types';
import { authSettings, withPreviewOrigin } from '$lib/server/indieauth/contracts';
import { AUTH_SCOPES, MCP_RESOURCE_PATH, MCP_SCOPES } from '$lib/server/indieauth/contracts';

export const prerender = false;

const HEADERS = { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' };

/**
 * OAuth protected resource metadata (RFC 9728) for the site's MCP servers: an MCP client
 * reads it to learn that this site's own IndieAuth server signs people in for them.
 */
const RESOURCES: Record<string, readonly string[]> = {
	// The whole site (`$lib/server/mcp/site`); asked for without a path, it is the one meant.
	'': MCP_SCOPES,
	[MCP_RESOURCE_PATH]: MCP_SCOPES,
	// Micropub alone (`$lib/server/chat/micropub-mcp`): Micropub's own scopes.
	'/micropub/mcp': AUTH_SCOPES.filter((scope) => scope !== 'profile')
};

export const GET: RequestHandler = ({ params, platform, request }) => {
	const path = params.path ? `/${params.path}` : '';
	if (!Object.hasOwn(RESOURCES, path)) return new Response('Not found', { status: 404 });
	const settings = platform?.env ? authSettings(withPreviewOrigin(platform.env, request)) : undefined;
	// A preview signs nobody in: it has no tokens to check.
	if (!settings || settings.previewIssuer) return new Response('Not available here.', { status: 404 });
	return Response.json({
		resource: `${new URL(settings.issuer).origin}${path || MCP_RESOURCE_PATH}`,
		authorization_servers: [settings.issuer],
		scopes_supported: RESOURCES[path],
		bearer_methods_supported: ['header'],
		resource_name: 'caseyagollan.com'
	}, { headers: HEADERS });
};

export const OPTIONS: RequestHandler = () => new Response(null, { status: 204, headers: { ...HEADERS, 'access-control-allow-methods': 'GET, OPTIONS' } });
