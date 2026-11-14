import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ProtocolError } from '$lib/server/publishing/auth';
import { readForm } from '$lib/server/publishing/composer';
import { COMPOSER_HEADERS, composerContext } from '$lib/server/publishing/composer-route';
import { validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

export const prerender = false;

export const load: PageServerLoad = async ({ request, platform, setHeaders }) => {
	setHeaders(COMPOSER_HEADERS);
	const context = await composerContext(request, platform?.env);
	if (!context) return { signedIn: false as const };
	let drafts: Awaited<ReturnType<NonNullable<typeof context.drafts>['list']>> = [], draftsError = '';
	try { if (context.drafts) drafts = await context.drafts.list(); }
	catch (cause) { draftsError = cause instanceof ProtocolError ? cause.message : 'Drafts could not be loaded.'; }
	return { signedIn: true as const, csrf: context.session.csrf, draftsEnabled: !!context.drafts, drafts, draftsError };
};

export const actions: Actions = {
	discard: async ({ request, platform }) => {
		const context = await composerContext(request, platform?.env);
		if (!context) return fail(401, { message: 'Sign in to manage drafts.' });
		try {
			const values = await readForm(request, 16 * 1024);
			await validateEditorSubmission(request, context.session, values.get('csrf'));
			if (!context.drafts) throw new ProtocolError(503, 'temporarily_unavailable', 'Drafts are not configured.');
			const found = await context.drafts.read(values.get('id') ?? '');
			if (found) await context.drafts.remove(found.draft.id, found.sha, found.draft.title);
			return { discarded: true, message: 'Draft discarded.' };
		} catch (cause) {
			if (cause instanceof ProtocolError) return fail(cause.status, { message: cause.message });
			throw cause;
		}
	}
};
