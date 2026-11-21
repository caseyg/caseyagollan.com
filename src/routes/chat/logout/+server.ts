import type { RequestHandler } from './$types';
import { endVisitorSession } from '$lib/server/chat/identity';
import { safeReturn } from '$lib/server/chat/login';

export const prerender = false;

/** Sign a visitor out of chat. Casey's own session is left alone; /account ends that. */
export const POST: RequestHandler = async ({ request, platform }) => {
	const form = await request.formData().catch(() => null);
	const headers = new Headers({ location: safeReturn(form?.get('return')), 'cache-control': 'no-store' });
	headers.append('set-cookie', await endVisitorSession(request, platform?.env ?? {}));
	return new Response(null, { status: 303, headers });
};
