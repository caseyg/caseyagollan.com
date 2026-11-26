import type { RequestHandler } from './$types';
import { getAllPosts } from '$lib/posts';
import { isPublicPost } from '$lib/server/parse-post';
import { publishingConfig } from '$lib/server/publishing/config';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';
import { PRIVATE } from '$lib/server/tables-api';
import { commitTags, postTagSuggestions, readTags, rehearsedSources, type TagDeps } from '$lib/server/tags';
import { cleanTags, validRef, type TagChange } from '$lib/tag-edits';

export const prerender = false;

const MAX_REFS = 400;
const refuse = (error: string, status: number) => Response.json({ error }, { status, headers: PRIVATE });

/**
 * Tags of the things on a table, for the signed-in owner:
 * `{ action: 'read', refs, suggest? }` answers `{ items, rehearsed, suggestions? }`;
 * `{ action: 'commit', changes: [{ ref, add, remove, base? }], message? }` saves them (posts as one
 * commit to the content repository, then Raindrop and Readwise) and answers `{ groups }`.
 *
 * Away from caseyagollan.com, without a session, this is the tables demo: posts' tags are read
 * from the build, nothing else is reachable, and every save is a dry run. Previews hold no
 * publishing configuration, and nothing but caseyagollan.com writes anywhere, so there a signed-in
 * save is a dry run too.
 */
export const POST: RequestHandler = async ({ request, platform, url }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	const demo = !session && url.hostname !== 'caseyagollan.com';
	if (!demo) {
		try {
			await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
		} catch (cause) {
			if (cause instanceof ProtocolError) return refuse(cause.status === 401 ? 'Sign in to read and change tags.' : cause.message, cause.status);
			throw cause;
		}
	}
	const body = (await request.json().catch(() => null)) as { action?: unknown; refs?: unknown; changes?: unknown; message?: unknown; suggest?: unknown } | null;
	// Only the site itself writes: a preview that somehow held a token would still only rehearse.
	const live = url.hostname === 'caseyagollan.com';
	const deps: TagDeps = demo
		? { env: {}, dryRun: true, bundled: async () => (await getAllPosts()).filter(isPublicPost) }
		: { env: env ?? {}, config: live ? publishingConfig(env) : undefined, dryRun: !live, bundled: getAllPosts };

	if (body?.action === 'read') {
		const refs = Array.isArray(body.refs) ? body.refs.filter(validRef).slice(0, MAX_REFS) : [];
		const [items, suggestions] = await Promise.all([readTags(refs, deps), body.suggest ? getAllPosts().then((posts) => postTagSuggestions(posts)) : undefined]);
		return Response.json({ items, rehearsed: rehearsedSources(deps), ...(suggestions ? { suggestions } : {}) }, { headers: PRIVATE });
	}

	if (body?.action === 'commit') {
		const changes: TagChange[] = [];
		for (const raw of Array.isArray(body.changes) ? body.changes.slice(0, MAX_REFS) : []) {
			const change = raw as { ref?: unknown; add?: unknown; remove?: unknown; base?: unknown } | null;
			if (!change || !validRef(change.ref)) return refuse('One of those changes names nothing that has tags.', 400);
			const add = cleanTags(change.add ?? []), remove = cleanTags(change.remove ?? []);
			if (add.length + remove.length === 0) continue;
			if (add.length + remove.length > 50) return refuse('That is too many tags for one thing.', 400);
			changes.push({ ref: change.ref, add, remove, ...(Array.isArray(change.base) ? { base: cleanTags(change.base).slice(0, 200) } : {}) });
		}
		if (!changes.length) return refuse('There is nothing to save.', 400);
		const message = typeof body.message === 'string' ? body.message : undefined;
		return Response.json(await commitTags(changes, { ...deps, message }), { headers: PRIVATE });
	}

	return refuse('Use action "read" or "commit".', 400);
};
