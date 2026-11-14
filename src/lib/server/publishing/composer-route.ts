import { error } from '@sveltejs/kit';
import { draftsConfig, publishingConfig, type PublishingEnvironment } from './config';
import { createDraftStore } from './composer';
import { editorSession } from './syndication-editor';

/** Response headers for owner-only composer pages. */
export const COMPOSER_HEADERS = { 'cache-control': 'no-store', 'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; form-action 'self'", 'referrer-policy': 'same-origin', 'x-robots-tag': 'noindex, nofollow' };

export async function composerContext(request: Request, env: PublishingEnvironment | undefined) {
	const session = await editorSession(request, env ?? {});
	if (!session) return null;
	const config = publishingConfig(env);
	if (!config) error(503, 'Publishing is unavailable.');
	const drafts = draftsConfig(env);
	return { session, config, drafts: drafts ? createDraftStore(drafts) : undefined };
}
