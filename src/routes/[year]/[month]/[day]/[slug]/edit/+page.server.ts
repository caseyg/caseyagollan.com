import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validPostParams } from '$lib/server/github-posts';
import { publishingConfig } from '$lib/server/publishing/config';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';
import { loadEditorSource, saveEditorPost, type ContentFormat, type EditorFields } from '$lib/server/publishing/post-editor';

export const prerender = false;

type Params = { year: string; month: string; day: string; slug: string };
const postUrl = (params: Params, me: string) => new URL(`/${params.year}/${params.month}/${params.day}/${encodeURIComponent(params.slug)}/`, me).href;
// Micropub accepts 128 KiB of JSON; form encoding can triple the size of the same text.
const FORM_LIMIT = 512 * 1024;

export const load: PageServerLoad = async ({ request, params, platform, setHeaders }) => {
	// Native form POSTs send Origin: null under no-referrer; preserve same-site origins.
	setHeaders({ 'cache-control': 'no-store', 'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; form-action 'self'", 'referrer-policy': 'same-origin', 'x-robots-tag': 'noindex, nofollow' });
	if (!validPostParams(params)) error(404, 'Post not found');
	const session = await editorSession(request, platform?.env ?? {});
	if (!session) return { signedIn: false as const };
	const config = publishingConfig(platform?.env);
	if (!config) error(503, 'Publishing is unavailable.');
	// The post is streamed: the page shell renders at once and fills in when GitHub answers.
	const editor = loadEditorSource(config, postUrl(params, config.me)).then(source => ({
		...source,
		github: source.path ? `https://github.com/${config.owner}/${config.repo}/blob/${config.branch.split('/').map(encodeURIComponent).join('/')}/${source.path.split('/').map(encodeURIComponent).join('/')}` : undefined,
		error: undefined
	}), (cause: unknown) => {
		if (!(cause instanceof ProtocolError)) console.warn(JSON.stringify({ event: 'post_editor_load_failed' }));
		return { error: cause instanceof ProtocolError ? cause.message : 'The post could not be loaded. Reload to try again.' };
	});
	return { signedIn: true as const, csrf: session.csrf, editor };
};

/** The properties panel posts its rows as JSON: { key: [values] }. Anything else is ignored. */
function frontmatter(value: string | null): Record<string, string[]> | undefined {
	if (!value) return;
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
		return Object.fromEntries(Object.entries(parsed).filter(([, values]) => Array.isArray(values) && values.every(item => typeof item === 'string')));
	} catch { return; }
}

/** The photos panel posts alt text as a JSON list of strings, one per photo. */
function photoAlts(value: string | null): string[] | undefined {
	if (!value) return;
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : undefined;
	} catch { return; }
}

export const actions: Actions = {
	default: async ({ request, params, platform }) => {
		if (!validPostParams(params)) error(404, 'Post not found');
		const session = await editorSession(request, platform?.env ?? {});
		if (!session) return fail(401, { message: 'Sign in to edit this post.' });
		if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') return fail(415, { message: 'Submit the edit form.' });
		const reader = request.body?.getReader();
		const decoder = new TextDecoder();
		let text = '', size = 0;
		if (reader) while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > FORM_LIMIT) { await reader.cancel(); return fail(413, { message: 'The post is too large to save from this form.' }); }
			text += decoder.decode(value, { stream: true });
		}
		const values = new URLSearchParams(text + decoder.decode());
		const format = values.get('format');
		const fields: EditorFields = {
			// A form without a title field leaves the title untouched.
			name: values.get('name') ?? undefined,
			content: values.get('content') ?? '', format: (['text', 'markdown', 'html'].includes(format ?? '') ? format : 'markdown') as ContentFormat,
			status: values.get('status') === 'draft' ? 'draft' : 'published',
			properties: frontmatter(values.get('properties')),
			photoAlts: photoAlts(values.get('photo-alts'))
		};
		try {
			await validateEditorSubmission(request, session, values.get('csrf'));
			const config = publishingConfig(platform?.env);
			if (!config) error(503, 'Publishing is unavailable.');
			const saved = await saveEditorPost(config, postUrl(params, config.me), values.get('revision') ?? '', fields);
			return { saved, message: saved ? 'Saved. The public page updates after the site rebuilds, usually within a few minutes.' : 'No changes to save.' };
		} catch (cause) {
			if (cause instanceof ProtocolError) return fail(cause.status, { message: cause.message, fields });
			console.warn(JSON.stringify({ event: 'post_editor_failed' }));
			return fail(503, { message: 'The post could not be saved. Reload before trying again.', fields });
		}
	}
};
