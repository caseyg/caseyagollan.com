import { listTables } from '$lib/server/tables';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return { tables: await listTables(platform?.env?.PUBLISHING_STATE) };
};
