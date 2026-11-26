import type { RequestHandler } from './$types';
import { CHAT_OWNER_ONLY, chatPage } from '$lib/chat';
import { chatViewer } from '$lib/server/chat/identity';
import { listThreads, newThreadId, threadStub } from '$lib/server/chat/threads';

export const prerender = false;

const PRIVATE = { 'cache-control': 'private, no-store' };

/**
 * The chat that follows Casey around the site (`SiteChat`). GET says who is chatting, or with
 * `?threads` lists the chats; POST starts a thread with its first message and the page it was
 * written on.
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
	if (url.searchParams.has('threads')) return Response.json({ threads: await listThreads(found.env.PUBLISHING_STATE, 50) }, { headers: PRIVATE });
	return Response.json({ viewer: found.viewer }, { headers: PRIVATE });
};

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const found = await viewerFor(request, platform);
	if (!found) return Response.json({ error: 'Not found' }, { status: 404, headers: PRIVATE });
	const body = (await request.json().catch(() => null)) as { text?: unknown; page?: unknown; selection?: unknown } | null;
	const id = newThreadId();
	const stub = threadStub(found.env, id);
	if (!stub) return Response.json({ error: 'Chat isn’t available here.' }, { status: 503, headers: PRIVATE });
	const result = await stub.start(id, url.origin + '/', found.viewer, String(body?.text ?? ''), chatPage(body?.page) ?? undefined, body?.selection);
	if ('error' in result) return Response.json({ error: result.error }, { status: 400, headers: PRIVATE });
	return Response.json({ id }, { headers: PRIVATE });
};
