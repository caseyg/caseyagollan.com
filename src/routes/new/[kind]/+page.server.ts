import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isComposerKind, type ComposerFields } from '$lib/composer-kinds';
import { ProtocolError } from '$lib/server/publishing/auth';
import { entryFromFields, fieldsFromForm, fieldsFromQuery, publishEntry, readForm } from '$lib/server/publishing/composer';
import { COMPOSER_HEADERS, composerContext } from '$lib/server/publishing/composer-route';
import { listContentDrafts } from '$lib/server/publishing/content-drafts';
import { syndicationTargets } from '$lib/server/publishing/delivery';
import { validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

export const prerender = false;

export const load: PageServerLoad = async ({ request, params, url, platform, setHeaders }) => {
	setHeaders(COMPOSER_HEADERS);
	if (!isComposerKind(params.kind)) error(404, 'Unknown post type');
	const context = await composerContext(request, platform?.env);
	if (!context) return { signedIn: false as const, kind: params.kind };
	const { config, drafts } = context;
	let fields: ComposerFields = fieldsFromQuery(params.kind, url.searchParams);
	let draft: { id: string; sha: string; created: string; updated: string } | undefined;
	const id = url.searchParams.get('draft');
	if (id) {
		if (!drafts) error(503, 'Drafts are not configured.');
		try {
			const found = await drafts.read(id);
			if (!found) error(404, 'Draft not found');
			if (found.draft.kind !== params.kind) redirect(307, `/new/${found.draft.kind}/?draft=${encodeURIComponent(id)}`);
			fields = found.draft.fields;
			draft = { id, sha: found.sha, created: found.draft.created, updated: found.draft.updated };
		} catch (cause) {
			if (cause instanceof ProtocolError) error(cause.status, cause.message);
			throw cause;
		}
	}
	let list: Awaited<ReturnType<NonNullable<typeof drafts>['list']>> = [], draftsError = '';
	try { if (drafts) list = await drafts.list(); }
	catch (cause) { draftsError = cause instanceof ProtocolError ? cause.message : 'Drafts could not be loaded.'; }
	// Streamed: the composer is usable while GitHub is searched for posts marked draft.
	const contentDrafts = listContentDrafts(config).catch(() => ({ drafts: [], error: 'Drafts in the content repository could not be loaded.' }));
	return {
		signedIn: true as const, kind: params.kind, csrf: context.session.csrf, fields, draft, drafts: list, draftsError, contentDrafts,
		syndication: syndicationTargets(config), mediaEnabled: !!config.mediaEnabled, draftsEnabled: !!drafts, timeZone: config.timeZone
	};
};

export const actions: Actions = {
	submit: async ({ request, params, platform }) => {
		if (!isComposerKind(params.kind)) error(404, 'Unknown post type');
		const kind = params.kind;
		const context = await composerContext(request, platform?.env);
		if (!context) return fail(401, { message: 'Sign in to post.' });
		let fields: ComposerFields = {};
		try {
			const values = await readForm(request);
			fields = fieldsFromForm(values);
			await validateEditorSubmission(request, context.session, values.get('csrf'));
			const intent = values.get('intent');
			const draftId = values.get('draft-id') || undefined;
			const existing = draftId && context.drafts ? await context.drafts.read(draftId) : null;
			if (draftId && !existing) throw new ProtocolError(404, 'invalid_request', 'This draft was published or discarded elsewhere.');
			if (existing && existing.sha !== values.get('draft-sha')) throw new ProtocolError(409, 'invalid_request', 'The draft changed since you opened it. Reload to see the latest version.');
			if (intent === 'save') {
				if (!context.drafts) throw new ProtocolError(503, 'temporarily_unavailable', 'Drafts are not configured.');
				let entry;
				try { entry = entryFromFields(kind, fields, context.config.timeZone); } catch { /* Drafts may be incomplete. */ }
				const saved = await context.drafts.save(kind, fields, existing ? { id: existing.draft.id, sha: existing.sha, created: existing.draft.created } : undefined, entry);
				redirect(303, `/new/${kind}/?draft=${encodeURIComponent(saved.id)}&saved=1`);
			}
			if (intent !== 'publish') throw new ProtocolError(400, 'invalid_request', 'Choose Publish or Save draft.');
			const location = await publishEntry(context.config, entryFromFields(kind, fields, context.config.timeZone));
			let warning = '';
			if (existing && context.drafts) {
				try { await context.drafts.remove(existing.draft.id, existing.sha, existing.draft.title); }
				catch { warning = ' The draft could not be removed from the drafts repository; discard it from the drafts list.'; }
			}
			redirect(303, `/new/${kind}/?published=${encodeURIComponent(location)}${warning ? '&draft-kept=1' : ''}`);
		} catch (cause) {
			if (cause instanceof ProtocolError) return fail(cause.status, { message: cause.message, fields });
			throw cause;
		}
	},
	discard: async ({ request, params, platform }) => {
		const kind = isComposerKind(params.kind) ? params.kind : 'note';
		const context = await composerContext(request, platform?.env);
		if (!context) return fail(401, { message: 'Sign in to manage drafts.' });
		try {
			const values = await readForm(request, 16 * 1024);
			await validateEditorSubmission(request, context.session, values.get('csrf'));
			if (!context.drafts) throw new ProtocolError(503, 'temporarily_unavailable', 'Drafts are not configured.');
			const found = await context.drafts.read(values.get('id') ?? '');
			if (found) await context.drafts.remove(found.draft.id, found.sha, found.draft.title);
		} catch (cause) {
			if (cause instanceof ProtocolError) return fail(cause.status, { message: cause.message });
			throw cause;
		}
		redirect(303, `/new/${kind}/?discarded=1`);
	}
};
