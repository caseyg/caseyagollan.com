import type { RequestHandler } from './$types';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';
import { PRIVATE } from '$lib/server/tables-api';
import { changeWords, readWords } from '$lib/server/voice-words';

export const prerender = false;

const refuse = (error: string, status: number) => Response.json({ error }, { status, headers: PRIVATE });

/** The signed-in owner, or the answer that refuses anyone else. A change must also carry the session's token, from this site's own pages. */
async function owner(request: Request, env: App.Platform['env'] | undefined, url: URL, changing: boolean): Promise<Response | null> {
	if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return refuse('Not found', 404);
	if (!changing) return null;
	try {
		await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
		return null;
	} catch (cause) {
		if (cause instanceof ProtocolError) return refuse(cause.message, cause.status);
		throw cause;
	}
}

/**
 * The voice note's known words (`docs/tables/voice-notes.md`, "Known words"): kept with the
 * site's private state, so they are the same on every device, and read or changed only by the
 * signed-in owner who added them. Anyone else gets a 404, and nothing public ever lists them.
 *
 * `GET` answers `{ words }`. `POST { add?, remove? }` changes the list and answers it whole;
 * changes are words to add and take out, not a new list, so two devices don't undo each other.
 */
export const GET: RequestHandler = async ({ request, platform, url }) => {
	const refused = await owner(request, platform?.env, url, false);
	if (refused) return refused;
	return Response.json({ words: await readWords(platform?.env?.PUBLISHING_STATE) }, { headers: PRIVATE });
};

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const refused = await owner(request, platform?.env, url, true);
	if (refused) return refused;
	const bucket = platform?.env?.PUBLISHING_STATE;
	if (!bucket) return refuse('Known words can’t be saved here.', 503);
	const body = (await request.json().catch(() => null)) as { add?: unknown; remove?: unknown } | null;
	return Response.json({ words: await changeWords(bucket, body?.add, body?.remove) }, { headers: PRIVATE });
};
