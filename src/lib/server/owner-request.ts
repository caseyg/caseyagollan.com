import { ProtocolError } from './publishing/auth';
import type { IndieAuthEnvironment, SessionInfo } from './indieauth/contracts';
import { editorSession, validateEditorSubmission } from './publishing/syndication-editor';

const PRIVATE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

/**
 * For endpoints only Casey may use. Returns the owner's session, or the refusal to send.
 * With `write`, the request must also come from the site's own pages and carry the session's
 * CSRF token in `x-csrf-token`, like every other owner change.
 */
export async function ownerRequest(request: Request, env: IndieAuthEnvironment | undefined, options: { write?: boolean } = {}): Promise<SessionInfo | Response> {
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return Response.json({ error: 'Sign in to do that.' }, { status: 401, headers: PRIVATE });
	if (!options.write) return session;
	try {
		await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
	} catch (cause) {
		if (cause instanceof ProtocolError) return Response.json({ error: cause.message }, { status: cause.status, headers: PRIVATE });
		throw cause;
	}
	return session;
}
