import type { RequestHandler } from './$types';
import { ownerBucket, PRIVATE } from '$lib/server/tables-api';
import { namer, nameUntitled } from '$lib/server/table-names';

export const prerender = false;

/**
 * Names the untitled tables from before tables named themselves, a few with each call: answers
 * `{ named: [{ id, name }], left }`, and the owner's browser asks again until none are left.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const bucket = await ownerBucket(request, platform?.env);
	if (bucket instanceof Response) return bucket;
	const ask = namer(platform?.env ?? {});
	if (!ask) return Response.json({ error: 'No model is set up here to name tables.' }, { status: 503, headers: PRIVATE });
	return Response.json(await nameUntitled(bucket, ask), { headers: PRIVATE });
};
