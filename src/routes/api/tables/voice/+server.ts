import type { RequestHandler } from './$types';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';
import { PRIVATE } from '$lib/server/tables-api';
import { refineSpeech } from '$lib/server/voice';
import { cleanRefine } from '$lib/voice-notes';

export const prerender = false;

const refuse = (error: string, status: number) => Response.json({ error }, { status, headers: PRIVATE });

/**
 * A finished voice note block, for a model to correct and place:
 * `{ text, correct, connect, before?, items? }` answers `{ text, follows? }`.
 * Only the signed-in owner may ask, previews included, since every call is paid for; a local run
 * is open so the table demo can be tried with a key in `.dev.vars`. (The microphone itself goes
 * to `/api/tables/voice/listen`, a WebSocket the Worker answers before SvelteKit: `worker.mjs`.)
 */
export const POST: RequestHandler = async ({ request, platform, url }) => {
	const env = platform?.env;
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (!local) {
		const session = await editorSession(request, env ?? {}).catch(() => null);
		try {
			await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
		} catch (cause) {
			if (cause instanceof ProtocolError) return refuse(cause.status === 401 ? 'Only the owner can do that.' : cause.message, cause.status);
			throw cause;
		}
	}
	const asked = cleanRefine(await request.json().catch(() => null));
	if (!asked) return refuse('Send the words of a block, and what to do with them.', 400);
	try {
		const answer = await refineSpeech(env ?? {}, asked, request.signal);
		if (!answer) return refuse('No model is set up here to correct or place voice notes.', 503);
		return Response.json(answer, { headers: PRIVATE });
	} catch (error) {
		console.error(JSON.stringify({ event: 'voice_refine_failed', error: String((error as Error)?.message ?? error).slice(0, 200) }));
		return refuse('The model couldn’t be asked just now.', 502);
	}
};
