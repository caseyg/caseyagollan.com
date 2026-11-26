/**
 * Headers every response the Worker renders gets, unless the route set its own: no MIME sniffing,
 * HTTPS only, no framing by other sites, and no plugins or `<base>` tricks. The root `_headers`
 * file gives the prerendered pages and other static files the same.
 *
 * This is not a script policy: pages still run inline and third-party scripts as before. What
 * these stop is clickjacking of the owner's pages, downgrade to HTTP, and content sniffing.
 */
export const HSTS = 'max-age=31536000';
export const PERMISSIONS = 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)';
export const PAGE_POLICY = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'";
/** Table embeds are made to be framed by any site. */
export const EMBED_POLICY = "base-uri 'self'; object-src 'none'";

const EMBED_ROUTES = new Set(['/tables/[id]/embed']);

export function withSecurityHeaders(request: Request, routeId: string | null, response: Response): Response {
	const set = (headers: Headers) => {
		const add = (name: string, value: string) => { if (!headers.has(name)) headers.set(name, value); };
		add('x-content-type-options', 'nosniff');
		add('referrer-policy', 'strict-origin-when-cross-origin');
		add('permissions-policy', PERMISSIONS);
		if (new URL(request.url).protocol === 'https:') add('strict-transport-security', HSTS);
		if (/^text\/html\b/i.test(headers.get('content-type') ?? '')) {
			const embed = routeId !== null && EMBED_ROUTES.has(routeId);
			add('content-security-policy', embed ? EMBED_POLICY : PAGE_POLICY);
			if (!embed) add('x-frame-options', 'SAMEORIGIN');
		}
	};
	try {
		set(response.headers);
		return response;
	} catch {
		// Some responses (a fetched one passed through) have immutable headers.
		const copy = new Response(response.body, response);
		set(copy.headers);
		return copy;
	}
}
