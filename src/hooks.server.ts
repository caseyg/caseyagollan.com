import type { Handle } from '@sveltejs/kit';
import { forbiddenForm } from '$lib/server/form-origin';

export const handle: Handle = ({ event, resolve }) => {
	if (forbiddenForm(event.request, event.route.id)) {
		return new Response('Cross-site form submissions are forbidden', { status: 403 });
	}
	// Tag pages moved from /tag/ to /tags/; keep old links working.
	const { pathname } = event.url;
	if (pathname === '/tag' || pathname.startsWith('/tag/')) {
		return new Response(null, { status: 308, headers: { location: `/tags${pathname.slice(4)}${event.url.search}` } });
	}
	return resolve(event);
};
