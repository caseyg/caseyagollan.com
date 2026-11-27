import type { RequestHandler } from './$types';
import { CHAT_ID, CHAT_OWNER_ONLY, chatPage } from '$lib/chat';
import { chatViewer } from '$lib/server/chat/identity';
import { deleteThreadFiles, listThreads, newThreadId, searchThreads, threadStub, type ChatThreadStub } from '$lib/server/chat/threads';

export const prerender = false;

const PRIVATE = { 'cache-control': 'private, no-store' };

/**
 * The chat that follows Casey around the site (`SiteChat`). GET says who is chatting, with
 * `?threads` lists the chats, or with `?search=` finds chats by title and by what was said (Casey only); POST starts a thread with its first message and the page it was
 * written on; `say` is the id the browser already shows that message under. PATCH `{ id, archived }`
 * puts a chat away or brings it back, and DELETE `{ id }` deletes one for good (Casey only, from the
 * site's own pages); `?threads&archived` lists the chats put away.
 */
async function viewerFor(request: Request, platform: App.Platform | undefined) {
	const env = (platform?.env ?? {}) as NonNullable<App.Platform['env']>;
	const viewer = await chatViewer(request, env).catch(() => null);
	if (!viewer || (CHAT_OWNER_ONLY && !viewer.owner)) return null;
	return { env, viewer };
}

export const GET: RequestHandler = async ({ request, platform, url }) => {
	const found = await viewerFor(request, platform);
	if (!found || !found.env.ChatThread) return Response.json({ error: 'Not found' }, { status: 404, headers: PRIVATE });
	// `?threads`: the chats to flip between, newest first.
	if (url.searchParams.has('threads') && url.searchParams.has('archived')) {
		if (!found.viewer.owner) return Response.json({ error: 'Not found' }, { status: 404, headers: PRIVATE });
		return Response.json({ threads: await listThreads(found.env.PUBLISHING_STATE, 200, true) }, { headers: PRIVATE });
	}
	if (url.searchParams.has('threads')) return Response.json({ threads: await listThreads(found.env.PUBLISHING_STATE, 50) }, { headers: PRIVATE });
	// `?search=words`: only ever for Casey, whoever else chat is opened to.
	const search = url.searchParams.get('search');
	if (search !== null) {
		if (!found.viewer.owner) return Response.json({ error: 'Not found' }, { status: 404, headers: PRIVATE });
		return Response.json({ results: await searchThreads(found.env, search.slice(0, 200)) }, { headers: PRIVATE });
	}
	return Response.json({ viewer: found.viewer }, { headers: PRIVATE });
};

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const found = await viewerFor(request, platform);
	if (!found) return Response.json({ error: 'Not found' }, { status: 404, headers: PRIVATE });
	const body = (await request.json().catch(() => null)) as { text?: unknown; page?: unknown; selection?: unknown; say?: unknown } | null;
	const id = newThreadId();
	const stub = threadStub(found.env, id);
	if (!stub) return Response.json({ error: 'Chat isn’t available here.' }, { status: 503, headers: PRIVATE });
	const result = await stub.start(id, url.origin + '/', found.viewer, String(body?.text ?? ''), chatPage(body?.page) ?? undefined, body?.selection, body?.say);
	if ('error' in result) return Response.json({ error: result.error }, { status: 400, headers: PRIVATE });
	return Response.json({ id }, { headers: PRIVATE });
};

/** Casey, asking from one of the site's own pages, about one thread. */
async function ownersThread(request: Request, platform: App.Platform | undefined, url: URL): Promise<{ refusal: Response } | { env: NonNullable<App.Platform['env']>; id: string; stub: ChatThreadStub; body: { archived?: unknown } | null }> {
	const found = await viewerFor(request, platform);
	if (!found?.viewer.owner) return { refusal: Response.json({ error: 'Not found' }, { status: 404, headers: PRIVATE }) };
	// Only this site's own pages may change chats, whatever cookies a browser sends along.
	if (request.headers.get('origin') !== url.origin || !/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return { refusal: Response.json({ error: 'Not allowed.' }, { status: 403, headers: PRIVATE }) };
	const body = (await request.json().catch(() => null)) as { id?: unknown; archived?: unknown } | null;
	const id = typeof body?.id === 'string' && CHAT_ID.test(body.id) ? body.id : '';
	const stub = id ? threadStub(found.env, id) : undefined;
	if (!stub) return { refusal: Response.json({ error: 'That chat isn’t there any more.' }, { status: 404, headers: PRIVATE }) };
	return { env: found.env, id, stub, body };
}

export const PATCH: RequestHandler = async ({ request, platform, url }) => {
	const asked = await ownersThread(request, platform, url);
	if ('refusal' in asked) return asked.refusal;
	if (typeof asked.body?.archived !== 'boolean') return Response.json({ error: 'Say whether to archive it.' }, { status: 400, headers: PRIVATE });
	const thread = await asked.stub.archive(asked.body.archived).catch(() => undefined);
	if (thread === undefined) return Response.json({ error: 'That didn’t work. Try again.' }, { status: 500, headers: PRIVATE });
	if (!thread) return Response.json({ error: 'That chat isn’t there any more.' }, { status: 404, headers: PRIVATE });
	return Response.json({ thread }, { headers: PRIVATE });
};

export const DELETE: RequestHandler = async ({ request, platform, url }) => {
	const asked = await ownersThread(request, platform, url);
	if ('refusal' in asked) return asked.refusal;
	const removed = await asked.stub.remove().catch((error) => {
		console.warn(JSON.stringify({ event: 'chat_delete_failed', id: asked.id, detail: String((error as Error)?.message ?? error).slice(0, 200) }));
		return undefined;
	});
	if (removed === undefined) return Response.json({ error: 'That didn’t delete. Try again.' }, { status: 500, headers: PRIVATE });
	// A thread that was only ever a line in the list goes from the list all the same.
	await deleteThreadFiles(asked.env.PUBLISHING_STATE, asked.id).catch(() => undefined);
	return Response.json({ deleted: true }, { headers: PRIVATE });
};
