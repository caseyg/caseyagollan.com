import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { chatViewer } from '$lib/server/chat/identity';
import { threadStub } from '$lib/server/chat/threads';

export const prerender = false;

export const load: PageServerLoad = async ({ params, request, platform, url, setHeaders }) => {
	const env = (platform?.env ?? {}) as NonNullable<App.Platform['env']>;
	const stub = threadStub(env, params.id);
	if (!stub) error(404, 'No such chat');
	const [snapshot, viewer] = await Promise.all([stub.snapshot(), chatViewer(request, env).catch(() => null)]);
	if (!snapshot) error(404, 'No such chat');
	setHeaders({ 'cache-control': 'private, no-store' });
	return { snapshot, viewer, signinError: url.searchParams.get('signin')?.slice(0, 200) ?? null };
};

export const actions: Actions = {
	/** The no-JavaScript way to write; the page sends over its WebSocket otherwise. */
	default: async ({ params, request, platform }) => {
		const env = (platform?.env ?? {}) as NonNullable<App.Platform['env']>;
		const stub = threadStub(env, params.id);
		if (!stub) error(404, 'No such chat');
		const viewer = await chatViewer(request, env).catch(() => null);
		const text = String((await request.formData()).get('text') ?? '');
		const result = await stub.say(viewer, text);
		if ('error' in result) return fail(viewer ? 400 : 401, { error: result.error, text });
		return { sent: true };
	}
};
