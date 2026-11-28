import type { RequestHandler } from './$types';
import { ownerBucket, PRIVATE } from '$lib/server/tables-api';
import { namer, nameTable } from '$lib/server/table-names';

export const prerender = false;

/**
 * Names the table if it is still untitled and has words on it: what the owner's browser asks as
 * a table is left. Answers `{ name }`, the table's name now, or `{ name: null }` when it stays untitled.
 */
export const POST: RequestHandler = async ({ params, request, platform }) => {
	const bucket = await ownerBucket(request, platform?.env);
	if (bucket instanceof Response) return bucket;
	const ask = namer(platform?.env ?? {});
	if (!ask) return Response.json({ name: null }, { headers: PRIVATE });
	try {
		const outcome = await nameTable(bucket, ask, params.id);
		if (outcome.state === 'missing') return Response.json({ error: 'No such table.' }, { status: 404, headers: PRIVATE });
		return Response.json({ name: 'name' in outcome ? outcome.name : null, named: outcome.state === 'named' }, { headers: PRIVATE });
	} catch (error) {
		// The Worker's own pass names it later.
		console.error(JSON.stringify({ event: 'table_name_failed', error: String((error as Error)?.message ?? error).slice(0, 200) }));
		return Response.json({ name: null }, { headers: PRIVATE });
	}
};
