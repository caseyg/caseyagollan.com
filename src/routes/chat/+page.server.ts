import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { chatHref } from '$lib/chat';
import { chatViewer } from '$lib/server/chat/identity';
import { newThreadId, threadStub } from '$lib/server/chat/threads';

export const prerender = false;

export const load: PageServerLoad = async ({ request, platform, url, setHeaders }) => {
	const env = (platform?.env ?? {}) as NonNullable<App.Platform['env']>;
	setHeaders({ 'cache-control': 'private, no-store' });
	const viewer = await chatViewer(request, env).catch(() => null);
	return { viewer, signinError: url.searchParams.get('signin')?.slice(0, 200) ?? null, available: !!env.ChatThread };
};

export const actions: Actions = {
	/** Start a thread with its first message. */
	default: async ({ request, platform, url }) => {
		const env = (platform?.env ?? {}) as NonNullable<App.Platform['env']>;
		const viewer = await chatViewer(request, env).catch(() => null);
		if (!viewer) return fail(401, { error: 'Sign in to start a chat.', text: '' });
		const text = String((await request.formData()).get('text') ?? '');
		const id = newThreadId();
		const stub = threadStub(env, id);
		if (!stub) return fail(503, { error: 'Chat isn’t available here.', text });
		const result = await stub.start(id, url.origin + '/', viewer, text);
		if ('error' in result) return fail(400, { error: result.error, text });
		redirect(303, chatHref(id));
	}
};
