import type { Handle } from '@sveltejs/kit';
import { forbiddenForm } from '$lib/server/form-origin';

export const handle: Handle = ({ event, resolve }) => {
	if (forbiddenForm(event.request, event.route.id)) {
		return new Response('Cross-site form submissions are forbidden', { status: 403 });
	}
	return resolve(event);
};
