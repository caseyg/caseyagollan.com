import { ProtocolError } from './publishing/auth';
import { editorSession, validateEditorSubmission } from './publishing/syndication-editor';

export const PRIVATE = { 'cache-control': 'no-store' };

/** Only the signed-in owner changes tables. Returns the refusal to send, or the bucket to write to. */
export async function ownerBucket(request: Request, env: App.Platform['env'] | undefined): Promise<Response | R2Bucket> {
	const session = await editorSession(request, env ?? {}).catch(() => null);
	try {
		await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
	} catch (cause) {
		if (cause instanceof ProtocolError) return Response.json({ error: cause.message }, { status: cause.status, headers: PRIVATE });
		throw cause;
	}
	const bucket = env?.PUBLISHING_STATE;
	return bucket ?? Response.json({ error: 'Tables can’t be saved here.' }, { status: 503, headers: PRIVATE });
}
