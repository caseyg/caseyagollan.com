import type { RequestHandler } from './$types';
import { applyModeration, isHidden, parseModerationAction } from '$lib/webmentions';
import { postPaths, publicMention, readCounts, readMentions, readModeration, writeModeration } from '$lib/server/webmentions';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

const PRIVATE = { 'cache-control': 'no-store' };
const PUBLIC = { 'cache-control': 'public, max-age=60' };

/**
 * `?target=/2025/09/29/slug/` (repeatable, for a post's old addresses) returns that post's
 * mentions; `?counts` returns how many each post has. Visitors never receive hidden mentions.
 * The signed-in owner also gets the hidden ones, marked, and a CSRF token to change them.
 */
export const GET: RequestHandler = async ({ url, request, platform }) => {
	const env = platform?.env;
	if (url.searchParams.has('counts')) {
		return Response.json({ counts: (await readCounts(env?.PUBLISHING_STATE)) ?? null }, { headers: PUBLIC });
	}
	const paths = postPaths(url.searchParams.getAll('target'));
	if (!paths.length) return Response.json({ error: 'Name a post with ?target=.' }, { status: 400, headers: PRIVATE });

	const session = url.searchParams.has('owner') ? await editorSession(request, env ?? {}).catch(() => null) : null;
	const [{ mentions, archived }, moderation] = await Promise.all([readMentions(env ?? {}, paths), readModeration(env?.PUBLISHING_STATE)]);
	const shown = mentions
		.map((mention) => ({ ...publicMention(mention), hidden: isHidden(mention, moderation) }))
		.filter((mention) => session || !mention.hidden);
	return Response.json(
		{ mentions: shown, archived, owner: !!session && !!env?.PUBLISHING_STATE, ...(session ? { csrf: session.csrf, moderation } : {}) },
		{ headers: session ? PRIVATE : PUBLIC }
	);
};

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	try {
		await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
	} catch (cause) {
		if (cause instanceof ProtocolError) return Response.json({ error: cause.message }, { status: cause.status, headers: PRIVATE });
		throw cause;
	}
	const bucket = env?.PUBLISHING_STATE;
	if (!bucket) return Response.json({ error: 'Webmention settings can’t be saved here.' }, { status: 503, headers: PRIVATE });
	const change = parseModerationAction(await request.json().catch(() => null));
	if (!change) return Response.json({ error: 'That change isn’t valid.' }, { status: 400, headers: PRIVATE });
	const moderation = applyModeration(await readModeration(bucket), change);
	await writeModeration(bucket, moderation);
	return Response.json({ moderation }, { headers: PRIVATE });
};
