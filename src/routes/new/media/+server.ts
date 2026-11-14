import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publishingConfig } from '$lib/server/publishing/config';
import { ProtocolError } from '$lib/server/publishing/auth';
import { createMediaHandler } from '$lib/server/publishing/media';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

/** Same-origin uploads for the composer, authorized by the owner session instead of a token. */
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env ?? {};
	const session = await editorSession(request, env);
	try { await validateEditorSubmission(request, session, request.headers.get('x-csrf-token')); }
	catch (cause) { if (cause instanceof ProtocolError) return Response.json({ error: cause.code, error_description: cause.message }, { status: cause.status }); throw cause; }
	const config = publishingConfig(env);
	if (!config?.mediaBucket) error(503, 'Media uploads are unavailable.');
	const token = crypto.randomUUID().replaceAll('-', '');
	const owned = { ...config, introspect: async (value: string) => value === token ? { active: true, me: config.me, scope: 'media' } : { active: false } };
	const headers = new Headers(request.headers);
	headers.set('Authorization', `Bearer ${token}`);
	return createMediaHandler(owned, config.mediaBucket)(new Request(request.url, { method: 'POST', headers, body: request.body, duplex: 'half' } as RequestInit));
};
