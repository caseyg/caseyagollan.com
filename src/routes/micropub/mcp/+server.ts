import type { RequestHandler } from './$types';
import { publishingConfig } from '$lib/server/publishing/config';
import { createMicropubHandler } from '$lib/server/publishing/micropub';
import { handleMcpHttp } from '$lib/server/chat/micropub-mcp';

export const prerender = false;

/**
 * MCP over Streamable HTTP (JSON responses) in front of Micropub. The caller's IndieAuth
 * Bearer token is passed to the Micropub handler untouched, which checks it and its scopes.
 */
const handle: RequestHandler = ({ request, platform }) => {
	const micropub = createMicropubHandler(publishingConfig(platform?.env));
	const authorization = request.headers.get('authorization') ?? '';
	return handleMcpHttp(request, (query, init = {}) =>
		micropub(new Request(new URL(`/micropub${query}`, request.url), { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization } })));
};

export const POST = handle;
export const OPTIONS = handle;
export const GET = handle;
