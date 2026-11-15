import type { RequestHandler } from './$types';
import { applyAction, cleanSource, httpUrl, validTopic, type CurationAction, type GraphCuration } from '$lib/graph-curation';
import { readCuration, summarizePage, writeCuration } from '$lib/server/graph-curation';
import { warmScreenshot } from '$lib/server/screenshot';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

const PRIVATE = { 'cache-control': 'no-store' };

/** Everyone gets the curation so the graph shows it; the owner also gets a CSRF token to change it. */
export const GET: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const curation = await readCuration(env?.PUBLISHING_STATE);
	const session = await editorSession(request, env ?? {}).catch(() => null);
	return Response.json(
		{ curation, owner: !!session && !!env?.PUBLISHING_STATE, ...(session ? { csrf: session.csrf } : {}) },
		{ headers: session ? PRIVATE : { 'cache-control': 'public, max-age=60' } }
	);
};

function parseAction(body: unknown): CurationAction | null {
	if (!body || typeof body !== 'object') return null;
	const raw = body as Record<string, unknown>;
	const topic = validTopic(raw.topic);
	const url = httpUrl(raw.url);
	switch (raw.action) {
		case 'pin': {
			const source = cleanSource(raw.source);
			return topic && source ? { action: 'pin', topic, source } : null;
		}
		case 'unpin':
			return topic && url ? { action: 'unpin', topic, url } : null;
		case 'block-url':
		case 'block-domain':
			return url ? { action: raw.action, url } : null;
		case 'attach':
			return topic && url ? { action: 'attach', topic, url } : null;
	}
	return null;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	try {
		await validateEditorSubmission(request, session, request.headers.get('x-csrf-token'));
	} catch (cause) {
		if (cause instanceof ProtocolError) return Response.json({ error: cause.message }, { status: cause.status, headers: PRIVATE });
		throw cause;
	}
	const bucket = env?.PUBLISHING_STATE;
	if (!bucket) return Response.json({ error: 'Graph settings can’t be saved here.' }, { status: 503, headers: PRIVATE });

	const action = parseAction(await request.json().catch(() => null));
	if (!action) return Response.json({ error: 'That change isn’t valid.' }, { status: 400, headers: PRIVATE });

	let curation: GraphCuration = await readCuration(bucket);
	let fetched: boolean | undefined;
	let screenshot: boolean | undefined;
	if (action.action === 'attach') {
		const [page, shot] = await Promise.all([summarizePage(action.url), warmScreenshot(env ?? {}, action.url)]);
		fetched = page.fetched;
		screenshot = shot;
		curation = applyAction(curation, { action: 'pin', topic: action.topic, source: page.source });
	} else {
		if (action.action === 'pin') screenshot = await warmScreenshot(env ?? {}, action.source.url);
		curation = applyAction(curation, action);
	}
	await writeCuration(bucket, curation);
	return Response.json({ curation, fetched, screenshot }, { headers: PRIVATE });
};
