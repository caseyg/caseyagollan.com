import { error } from '@sveltejs/kit';
import { readTable } from '$lib/server/tables';
import { isOwner } from '$lib/server/tables-api';
import { isPublished, validId } from '$lib/tables';
import type { PageServerLoad } from './$types';

export const prerender = false;

/**
 * A saved table, or null for one that only exists in a browser's demo (`?owner=demo` away from
 * caseyagollan.com), which the page then reads from local storage.
 */
export const load: PageServerLoad = async ({ params, platform, url, setHeaders, request }) => {
	if (!validId(params.id)) error(404, 'No such table');
	const table = await readTable(platform?.env?.PUBLISHING_STATE, params.id);
	// A draft is the owner's alone: anyone else finds nothing here.
	if (table && !isPublished(table)) {
		if (!(await isOwner(request, platform?.env))) error(404, 'No such table');
		setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
		return { id: params.id, table };
	}
	const demo = url.searchParams.get('owner') === 'demo' && url.hostname !== 'caseyagollan.com';
	if (!table && !demo) error(404, 'No such table');
	setHeaders({ 'cache-control': 'no-cache' });
	return { id: params.id, table };
};
