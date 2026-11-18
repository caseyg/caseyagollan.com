import type { RequestHandler } from './$types';
import { applyNewsletterTheme, readNewsletter } from '$lib/server/buttondown';
import { NEWSLETTER_THEME } from '$lib/server/buttondown-theme';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

export const prerender = false;

const PRIVATE = { 'cache-control': 'no-store' };

/** The owner's newsletter on Buttondown, and which of the site's settings it already has. */
export const GET: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	if (!session) return Response.json({ error: 'Sign in to see the newsletter.' }, { status: 401, headers: PRIVATE });
	if (!env?.BUTTONDOWN_API_KEY) return Response.json({ configured: false }, { headers: PRIVATE });
	try {
		return Response.json({ configured: true, newsletter: await readNewsletter(env.BUTTONDOWN_API_KEY, NEWSLETTER_THEME) }, { headers: PRIVATE });
	} catch {
		return Response.json({ configured: true, error: 'Buttondown couldn’t be reached, or the key was refused.' }, { status: 502, headers: PRIVATE });
	}
};

/** Sends the site's look (`buttondown-theme.ts`) to Buttondown. Owner only, with the session's CSRF token. */
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	try {
		await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
	} catch (cause) {
		if (cause instanceof ProtocolError) return Response.json({ error: cause.message }, { status: cause.status, headers: PRIVATE });
		throw cause;
	}
	if (!env?.BUTTONDOWN_API_KEY) return Response.json({ error: 'Add the BUTTONDOWN_API_KEY secret to the Worker first.' }, { status: 503, headers: PRIVATE });
	try {
		return Response.json({ newsletter: await applyNewsletterTheme(env.BUTTONDOWN_API_KEY, NEWSLETTER_THEME) }, { headers: PRIVATE });
	} catch {
		return Response.json({ error: 'Buttondown didn’t take the change. Try again in a moment.' }, { status: 502, headers: PRIVATE });
	}
};
