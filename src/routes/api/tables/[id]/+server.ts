import type { RequestHandler } from './$types';
import { cleanName, summarizeDocument, validDocument, validThumbnail, type Table } from '$lib/tables';
import { readTable, writeTable, writeThumbnail } from '$lib/server/tables';
import { ownerBucket, PRIVATE } from '$lib/server/tables-api';

export const prerender = false;

export const GET: RequestHandler = async ({ params, platform }) => {
	const table = await readTable(platform?.env?.PUBLISHING_STATE, params.id);
	if (!table) return Response.json({ error: 'No such table.' }, { status: 404 });
	return Response.json({ table }, { headers: { 'cache-control': 'no-cache' } });
};

/** Saves a rename (`name`), a canvas (`document`), its picture (`thumbnail`, SVG), or any of them together. */
export const PUT: RequestHandler = async ({ params, request, platform }) => {
	const bucket = await ownerBucket(request, platform?.env);
	if (bucket instanceof Response) return bucket;
	const table = await readTable(bucket, params.id);
	if (!table) return Response.json({ error: 'No such table.' }, { status: 404, headers: PRIVATE });

	const body = (await request.json().catch(() => null)) as { name?: unknown; document?: unknown; thumbnail?: unknown } | null;
	const next: Table = { ...table };
	if (body?.name !== undefined) {
		const name = cleanName(body.name);
		if (!name) return Response.json({ error: 'A table needs a name.' }, { status: 400, headers: PRIVATE });
		next.name = name;
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
