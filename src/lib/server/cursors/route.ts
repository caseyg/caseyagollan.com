import { routePartykitRequest } from 'partyserver';
import { CURSOR_PARTY } from '../../cursors';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Sends `/parties/cursors/<page>` WebSockets to that page's `CursorRoom`. Only this site's own
 * pages may connect (a browser always sends `Origin` on a WebSocket), and plain HTTP to a room is
 * refused: rooms only speak WebSocket.
 */
export async function cursorRequest(request: Request, env: { CURSORS?: DurableObjectNamespace }): Promise<Response> {
	if (!env.CURSORS) return notFound();
	const url = new URL(request.url);
	if (!url.pathname.startsWith(`/parties/${CURSOR_PARTY}/`)) return notFound();
	if (originHost(request.headers.get('Origin')) !== url.host) return new Response('Forbidden', { status: 403 });

	const response = await routePartykitRequest(request, env as never, {
		prefix: 'parties',
		onBeforeRequest: () => notFound()
	});
	return response ?? notFound();
}

function originHost(origin: string | null) {
	try {
		return origin ? new URL(origin).host : null;
	} catch {
		return null;
	}
}
