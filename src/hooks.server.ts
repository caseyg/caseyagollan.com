import type { Handle } from '@sveltejs/kit';
import { forbiddenForm } from '$lib/server/form-origin';
import { CHAT_OWNER_ONLY } from '$lib/chat';
import { isOwnerRequest } from '$lib/server/chat/identity';
import { withOwnerHint } from '$lib/server/owner-hint';
import { withSecurityHeaders } from '$lib/server/security-headers';

export const handle: Handle = async ({ event, resolve }) => {
	if (forbiddenForm(event.request, event.route.id)) {
		return new Response('Cross-site form submissions are forbidden', { status: 403 });
	}
	// Tag pages moved from /tag/ to /tags/; keep old links working.
	const { pathname } = event.url;
	if (pathname === '/tag' || pathname.startsWith('/tag/')) {
		return new Response(null, { status: 308, headers: { location: `/tags${pathname.slice(4)}${event.url.search}` } });
	}
	// Chat is owner-only for now: everyone else finds nothing there.
	if (CHAT_OWNER_ONLY && (pathname === '/chat' || pathname.startsWith('/chat/'))) {
		const env = (event.platform?.env ?? {}) as NonNullable<App.Platform['env']>;
		if (!(await isOwnerRequest(event.request, env).catch(() => false))) return new Response('Not found', { status: 404, headers: { 'cache-control': 'private, no-store' } });
	}
	return withSecurityHeaders(event.request, event.route.id, withOwnerHint(event.request, await resolve(event)));
};
