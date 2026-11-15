import { error } from '@sveltejs/kit';
import { readTable } from '$lib/server/tables';
import { isPublished, validId } from '$lib/tables';
import type { PageServerLoad } from './$types';

export const prerender = false;

/** A published table, framed in a post. Drafts never show here, even to the owner. */
export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	if (!validId(params.id)) error(404, 'No such table');
	const table = await readTable(platform?.env?.PUBLISHING_STATE, params.id);
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return { id: params.id, table: table && isPublished(table) ? table : null };
};
