import { listPublishedTables } from '$lib/server/tables';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=60' });
	// Visitors' list, so it can be cached; the owner's page swaps in the list with drafts once signed in.
	return { tables: await listPublishedTables(platform?.env?.PUBLISHING_STATE) };
};
