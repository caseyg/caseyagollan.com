import type { LayoutServerLoad } from './$types';
import { listThreads } from '$lib/server/chat/threads';

export const prerender = false;

/** The chat list in the sidebar; pages call `invalidate('chat:threads')` when a thread moves. */
export const load: LayoutServerLoad = async ({ platform, depends }) => {
	depends('chat:threads');
	const env = (platform?.env ?? {}) as NonNullable<App.Platform['env']>;
	return { threads: await listThreads(env.PUBLISHING_STATE).catch(() => []) };
};
