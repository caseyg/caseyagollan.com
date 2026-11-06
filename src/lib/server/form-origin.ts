/** Preserve SvelteKit's form-origin policy except for the token-only protocol endpoint. */
export function forbiddenForm(request: Request, routeId: string | null): boolean {
	if ((routeId === '/micropub' || routeId === '/micropub/media')) return false;
	const path = new URL(request.url).pathname;
	if ((routeId === '/auth' || routeId === '/auth/[...path]') && ['/auth', '/auth/token', '/auth/revoke', '/auth/introspect'].includes(path)) return false;
	const mime = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
		['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'].includes(mime ?? '') &&
		request.headers.get('origin') !== new URL(request.url).origin;
}
