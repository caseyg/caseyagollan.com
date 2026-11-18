import type { RequestHandler } from './$types';
import { indieAuthClientId, redirectUri } from '$lib/server/chat/login';

export const prerender = false;

/** IndieAuth client metadata for chat sign-in (the client id is this document's URL). */
export const GET: RequestHandler = ({ url }) =>
	Response.json(
		{ client_id: indieAuthClientId(url.origin), client_name: 'caseyagollan.com chat', client_uri: `${url.origin}/chat/`, logo_uri: `${url.origin}/author-avatar.webp`, redirect_uris: [redirectUri(url.origin, 'indieauth')] },
		{ headers: { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } }
	);
