import type { RequestHandler } from './$types';
import { cleanName, isPublished, summarizeDocument, validDocument, type Table } from '$lib/tables';
import { readTable, writeTable } from '$lib/server/tables';
import { isOwner, ownerBucket, PRIVATE } from '$lib/server/tables-api';
import { passFor, passMayEdit } from '$lib/server/table-pass';

export const prerender = false;

/** A table; a draft only for the owner or a browser holding a pass to it, and anyone else is told there's no such table. */
export const GET: RequestHandler = async ({ params, platform, request }) => {
	const table = await readTable(platform?.env?.PUBLISHING_STATE, params.id);
	const draft = !!table && !isPublished(table);
	if (!table || (draft && !(await isOwner(request, platform?.env)) && !(await passFor(request, platform?.env?.PUBLISHING_STATE, table.id)))) return Response.json({ error: 'No such table.' }, { status: 404, headers: PRIVATE });
	return Response.json({ table }, { headers: draft ? PRIVATE : { 'cache-control': 'no-cache' } });
};

/**
 * Saves a rename (`name`), a canvas (`document`), publishing or unpublishing (`published`), or
 * any of them together.
 */
export const PUT: RequestHandler = async ({ params, request, platform }) => {
	// A browser holding an editing pass (a table opened from the Claude connector) saves that one table, and can't publish it.
	const state = platform?.env?.PUBLISHING_STATE;
	const onPass = !!state && (await passMayEdit(request, state, params.id));
	const bucket = onPass ? state : await ownerBucket(request, platform?.env);
	if (bucket instanceof Response) return bucket;
	const table = await readTable(bucket, params.id);
	if (!table) return Response.json({ error: 'No such table.' }, { status: 404, headers: PRIVATE });

	const body = (await request.json().catch(() => null)) as { name?: unknown; document?: unknown; published?: unknown } | null;
	if (onPass && body?.published !== undefined) return Response.json({ error: 'Sign in to publish or unpublish a table.' }, { status: 403, headers: PRIVATE });
	const next: Table = { ...table };
	if (body?.name !== undefined) {
		const name = cleanName(body.name);
		if (!name) return Response.json({ error: 'A table needs a name.' }, { status: 400, headers: PRIVATE });
		next.name = name;
	}
	if (body?.published !== undefined) {
		if (typeof body.published !== 'boolean') return Response.json({ error: 'Published is yes or no.' }, { status: 400, headers: PRIVATE });
		next.published = body.published;
	}
	if (body?.document !== undefined) {
		if (!validDocument(body.document)) return Response.json({ error: 'That canvas can’t be saved.' }, { status: 400, headers: PRIVATE });
		next.document = body.document;
		Object.assign(next, summarizeDocument(body.document));
	}
	next.updated = new Date().toISOString();
	await writeTable(bucket, next);
	const { document: _document, ...summary } = next;
	return Response.json({ table: summary }, { headers: PRIVATE });
};
