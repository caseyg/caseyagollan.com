import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { chatViewer } from '$lib/server/chat/identity';
import { listThreads } from '$lib/server/chat/threads';

export const prerender = false;

/** The chats Casey has archived. Only Casey has an archive. */
export const load: PageServerLoad = async ({ request, platform, depends, setHeaders }) => {
	depends('chat:archived');
	const env = (platform?.env ?? {}) as NonNullable<App.Platform['env']>;
	const viewer = await chatViewer(request, env).catch(() => null);
	if (!viewer?.owner) error(404, 'Not found');
	setHeaders({ 'cache-control': 'private, no-store' });
	return { viewer, archived: await listThreads(env.PUBLISHING_STATE, 200, true).catch(() => []) };
};
