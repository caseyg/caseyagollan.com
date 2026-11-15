import type { RequestHandler } from './$types';
import { cleanName, emptyTable, MAX_TABLES } from '$lib/tables';
import { listTables, writeTable } from '$lib/server/tables';
import { ownerBucket, PRIVATE } from '$lib/server/tables-api';
import { editorSession } from '$lib/server/publishing/syndication-editor';

export const prerender = false;

/** Everyone gets the list; the owner also gets a CSRF token to change tables. */
export const GET: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const session = await editorSession(request, env ?? {}).catch(() => null);
	const tables = await listTables(env?.PUBLISHING_STATE);
	return Response.json(
		{ tables, owner: !!session && !!env?.PUBLISHING_STATE, ...(session ? { csrf: session.csrf } : {}) },
		{ headers: session ? PRIVATE : { 'cache-control': 'public, max-age=60' } }
	);
};

/** Creates an empty table: `{ name }`. */
export const POST: RequestHandler = async ({ request, platform }) => {
	const bucket = await ownerBucket(request, platform?.env);
	if (bucket instanceof Response) return bucket;
	const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
	const name = cleanName(body?.name) ?? 'Untitled table';
	if ((await listTables(bucket)).length >= MAX_TABLES) return Response.json({ error: 'There are too many tables.' }, { status: 409, headers: PRIVATE });
	const table = emptyTable(name);
	await writeTable(bucket, table);
	return Response.json({ table }, { status: 201, headers: PRIVATE });
};
