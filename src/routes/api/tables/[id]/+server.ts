import type { RequestHandler } from './$types';
import { cleanName, isPublished, summarizeDocument, validDocument, validThumbnail, type Table } from '$lib/tables';
import { readTable, writeTable, writeThumbnail } from '$lib/server/tables';
import { isOwner, ownerBucket, PRIVATE } from '$lib/server/tables-api';

export const prerender = false;

/** A table; a draft only for the owner, and anyone else is told there's no such table. */
export const GET: RequestHandler = async ({ params, platform, request }) => {
	const table = await readTable(platform?.env?.PUBLISHING_STATE, params.id);
	const draft = !!table && !isPublished(table);
	if (!table || (draft && !(await isOwner(request, platform?.env)))) return Response.json({ error: 'No such table.' }, { status: 404, headers: PRIVATE });
	return Response.json({ table }, { headers: draft ? PRIVATE : { 'cache-control': 'no-cache' } });
};

/**
 * Saves a rename (`name`), a canvas (`document`), its picture (`thumbnail`, SVG), publishing or
 * unpublishing (`published`), or any of them together.
 */
export const PUT: RequestHandler = async ({ params, request, platform }) => {
	const bucket = await ownerBucket(request, platform?.env);
	if (bucket instanceof Response) return bucket;
	const table = await readTable(bucket, params.id);
	if (!table) return Response.json({ error: 'No such table.' }, { status: 404, headers: PRIVATE });

	const body = (await request.json().catch(() => null)) as { name?: unknown; document?: unknown; thumbnail?: unknown; published?: unknown } | null;
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
	if (body?.thumbnail !== undefined) {
		if (!validThumbnail(body.thumbnail)) return Response.json({ error: 'That picture can’t be saved.' }, { status: 400, headers: PRIVATE });
		await writeThumbnail(bucket, next.id, body.thumbnail);
		next.thumb = next.updated;
	}
	await writeTable(bucket, next);
	const { document: _document, ...summary } = next;
	return Response.json({ table: summary }, { headers: PRIVATE });
};
