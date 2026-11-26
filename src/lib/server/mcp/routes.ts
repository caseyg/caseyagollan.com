/** Shared by the MCP connection routes: the cookie that ties a sign-in to the browser that started it. */
export const MCP_BINDING_COOKIE = '__Host-mcp-oauth';
export const PRIVATE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

export function bindingCookie(value: string, maxAge = 600): string {
	return `${MCP_BINDING_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function readBinding(request: Request): string | undefined {
	return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(MCP_BINDING_COOKIE + '='))?.slice(MCP_BINDING_COOKIE.length + 1);
}
