/**
 * Whether a request comes from this site's own pages. Safari sends `Origin: null` on a
 * same-origin form post when the page's document was first loaded under a no-referrer
 * policy (such as /account), even after client-side navigation to a form page. Fetch
 * metadata still says `same-origin` then, and pages cannot forge that header.
 */
export function sameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	if (origin === new URL(request.url).origin) return true;
	return (origin === null || origin === 'null') && request.headers.get('sec-fetch-site') === 'same-origin';
}

/** Preserve SvelteKit's form-origin policy except for the token-only protocol endpoint. */
export function forbiddenForm(request: Request, routeId: string | null): boolean {
	if ((routeId === '/micropub' || routeId === '/micropub/media')) return false;
	const path = new URL(request.url).pathname;
	if ((routeId === '/auth' || routeId === '/auth/[...path]') && ['/auth', '/auth/token', '/auth/revoke', '/auth/introspect'].includes(path)) return false;
	const mime = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
		['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'].includes(mime ?? '') &&
		!sameOrigin(request);
}
