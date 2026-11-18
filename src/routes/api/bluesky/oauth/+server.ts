import type { RequestHandler } from './$types';
import { connectionStatus, disconnect, startConnect } from '$lib/server/publishing/bluesky-oauth';
import { bindingCookie, oauthFor, PRIVATE } from '$lib/server/publishing/bluesky-oauth-routes';
import { randomToken } from '$lib/server/publishing/dpop';
import { ProtocolError } from '$lib/server/publishing/auth';
import { DeliveryError } from '$lib/server/publishing/public-fetch';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

export const prerender = false;

/** How Bluesky posting is connected. Owner only; never returns tokens. */
export const GET: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return Response.json({ error: 'Sign in to see Bluesky.' }, { status: 401, headers: PRIVATE });
	const client = oauthFor(env, request.url);
	if (!client) return Response.json({ configured: false }, { headers: PRIVATE });
	return Response.json({ configured: true, connection: await connectionStatus(client.oauth, client.passwordFallback) }, { headers: PRIVATE });
};

/** `{ action: 'connect' }` returns Bluesky's sign-in page to open; `{ action: 'disconnect' }` revokes and forgets the session. */
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	try {
		await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
	} catch (cause) {
		if (cause instanceof ProtocolError) return Response.json({ error: cause.message }, { status: cause.status, headers: PRIVATE });
		throw cause;
	}
	const client = oauthFor(env, request.url);
	if (!client) return Response.json({ error: 'Bluesky OAuth is not set up on this site.' }, { status: 503, headers: PRIVATE });
	const body = await request.json().catch(() => ({})) as { action?: string };
	try {
		if (body.action === 'disconnect') {
			await disconnect(client.oauth);
			return Response.json({ configured: true, connection: await connectionStatus(client.oauth, client.passwordFallback) }, { headers: PRIVATE });
		}
		if (body.action !== 'connect') return Response.json({ error: 'Unknown action.' }, { status: 400, headers: PRIVATE });
		const binding = randomToken();
		const redirect = await startConnect(client.oauth, binding);
		return Response.json({ redirect }, { headers: { ...PRIVATE, 'set-cookie': bindingCookie(binding) } });
	} catch (cause) {
		if (cause instanceof DeliveryError) return Response.json({ error: cause.message }, { status: 502, headers: PRIVATE });
		throw cause;
	}
};
