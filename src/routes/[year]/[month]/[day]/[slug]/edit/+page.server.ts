import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { renamedPermalink } from '$lib/server/renamed-posts';
import type { Actions, PageServerLoad } from './$types';
import { validPostParams } from '$lib/server/github-posts';
import { publishingConfig } from '$lib/server/publishing/config';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';
import { loadEditorSource, saveEditorPost, type ContentFormat, type EditorFields } from '$lib/server/publishing/post-editor';
import { mergePullRequestBranch, pullRequestBranch } from '$lib/server/publishing/content-drafts';
import type { PublishingConfig } from '$lib/server/publishing/micropub';

export const prerender = false;

type Params = { year: string; month: string; day: string; slug: string };
const postUrl = (params: Params, me: string) => new URL(`/${params.year}/${params.month}/${params.day}/${encodeURIComponent(params.slug)}/`, me).href;
// Micropub accepts 128 KiB of JSON; form encoding can triple the size of the same text.
const FORM_LIMIT = 512 * 1024;

/**
 * `?pr=21` edits the post on that pull request's branch in the content repository, where a
 * draft can wait unmerged. Without it the post is read from the published branch.
 */
async function editingTarget(config: PublishingConfig, url: URL) {
	const pr = url.searchParams.get('pr');
	if (pr === null) return { target: config, pull: undefined };
	if (!/^\d{1,9}$/.test(pr)) throw new ProtocolError(404, 'invalid_request', 'Pull request not found.');
	const pull = await pullRequestBranch(config, Number(pr));
	return { target: { ...config, branch: pull.ref }, pull };
}

export const load: PageServerLoad = async ({ request, params, platform, setHeaders, url }) => {
	// Native form POSTs send Origin: null under no-referrer; preserve same-site origins.
	setHeaders({ 'cache-control': 'no-store', 'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; form-action 'self'", 'referrer-policy': 'same-origin', 'x-robots-tag': 'noindex, nofollow' });
	if (!validPostParams(params)) error(404, 'Post not found');
	// An old address of a renamed post opens the editor at its new one.
	const renamed = await renamedPermalink(params, 'edit/');
	if (renamed) redirect(308, renamed);
	const session = await editorSession(request, platform?.env ?? {});
	if (!session) return { signedIn: false as const };
	const config = publishingConfig(platform?.env);
	if (!config) error(503, 'Publishing is unavailable.');
	// The post is streamed: the page shell renders at once and fills in when GitHub answers.
	const editor = editingTarget(config, url).then(async ({ target, pull }) => {
		const source = await loadEditorSource(target, postUrl(params, config.me));
		return {
			...source,
			github: source.path ? `https://github.com/${config.owner}/${config.repo}/blob/${target.branch.split('/').map(encodeURIComponent).join('/')}/${source.path.split('/').map(encodeURIComponent).join('/')}` : undefined,
			pull: pull ? { number: pull.number, title: pull.title, url: pull.url } : undefined,
			error: undefined
		};
	}).catch((cause: unknown) => {
		if (!(cause instanceof ProtocolError)) console.warn(JSON.stringify({ event: 'post_editor_load_failed' }));
		return { error: cause instanceof ProtocolError ? cause.message : 'The post could not be loaded. Reload to try again.' };
	});
	// Set after a save that moved the post here from its old address.
	const moved = url.searchParams.has('moved');
	// Set after Publish merged the pull request the draft was on.
	const merged = /^\d{1,9}$/.test(url.searchParams.get('merged') ?? '') ? Number(url.searchParams.get('merged')) : undefined;
	return { signedIn: true as const, csrf: session.csrf, editor, moved, merged };
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
	default: async ({ request, params, platform, url }) => {
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
			// The Publish button publishes whatever the status row says.
			status: values.get('intent') !== 'publish' && values.get('status') === 'draft' ? 'draft' : 'published',
			properties: frontmatter(values.get('properties')),
			photoAlts: photoAlts(values.get('photo-alts')),
			slug: values.get('slug') ?? undefined
		};
		try {
			await validateEditorSubmission(request, session, values.get('csrf'));
			const config = publishingConfig(platform?.env);
			if (!config) error(503, 'Publishing is unavailable.');
			const { target, pull } = await editingTarget(config, url);
			const saved = await saveEditorPost(target, postUrl(params, config.me), values.get('revision') ?? '', fields);
			const address = typeof saved === 'string' ? new URL(saved).pathname : new URL(postUrl(params, config.me)).pathname;
			if (pull && fields.status === 'published') {
				// Publishing a pull request's draft lands its branch on the published branch.
				await mergePullRequestBranch(config, pull);
				redirect(303, `${address}edit/?merged=${pull.number}`);
			}
			// A new slug moved the post: continue editing at its new address.
			if (typeof saved === 'string') redirect(303, `${address}edit/?moved${pull ? `&pr=${pull.number}` : ''}`);
			if (pull) return { saved, message: saved ? `Saved to pull request #${pull.number}.` : 'No changes to save.' };
			const publishing = values.get('intent') === 'publish';
			return { saved, message: saved ? `${publishing ? 'Published' : 'Saved'}. The public page updates after the site rebuilds, usually within a few minutes.` : 'No changes to save.' };
		} catch (cause) {
			if (isRedirect(cause)) throw cause;
			if (cause instanceof ProtocolError) return fail(cause.status, { message: cause.message, fields });
			console.warn(JSON.stringify({ event: 'post_editor_failed' }));
			return fail(503, { message: 'The post could not be saved. Reload before trying again.', fields });
		}
	}
};
