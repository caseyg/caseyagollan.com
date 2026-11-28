import type { RequestHandler } from './$types';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';
import { PRIVATE } from '$lib/server/tables-api';
import { cleanVoiceLog } from '$lib/voice-notes';

export const prerender = false;

/**
 * What the browser noticed about a voice note, written to the Worker's log as `voice_client`
 * lines: when it started and through which source, each passage with its timings and what was
 * made of it, and how it ended (`docs/tables/voice-notes.md`, "Reading what happened"). Only the
 * signed-in owner's browser may write here; a local run is open, as the voice note itself is.
 */
export const POST: RequestHandler = async ({ request, platform, url }) => {
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (!local) {
		const session = await editorSession(request, platform?.env ?? {}).catch(() => null);
		try {
			await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
		} catch (cause) {
			if (cause instanceof ProtocolError) return Response.json({ error: 'Only the owner can do that.' }, { status: cause.status, headers: PRIVATE });
			throw cause;
		}
	}
	const entries = cleanVoiceLog(await request.json().catch(() => null));
	for (const entry of entries) console.log(JSON.stringify({ event: 'voice_client', ...entry }));
	return new Response(null, { status: 204, headers: PRIVATE });
};
