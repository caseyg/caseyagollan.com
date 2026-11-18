import { error } from '@sveltejs/kit';
import { readTable } from '$lib/server/tables';
import { chatViewer } from '$lib/server/chat/identity';
import { threadStub } from '$lib/server/chat/threads';
import { tableThreadId } from '$lib/table-agent';
import { isOwner } from '$lib/server/tables-api';
import { isPublished, validId, type Table } from '$lib/tables';
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
		return { id: params.id, table, chat: await tableChat(table, request, platform?.env, url) };
	}
	const demo = url.searchParams.get('owner') === 'demo' && url.hostname !== 'caseyagollan.com';
	if (!table && !demo) error(404, 'No such table');
	const chat = table ? await tableChat(table, request, platform?.env, url) : null;
	// Who is signed in to the chat changes the page, so it isn't shared between people.
	setHeaders({ 'cache-control': chat ? 'private, no-cache' : 'no-cache' });
	return { id: params.id, table, chat };
};

/** The table's chat thread (made on first visit) and who is reading it; null where chat isn't set up. */
async function tableChat(table: Table, request: Request, env: App.Platform['env'] | undefined, url: URL) {
	const stub = threadStub(env ?? {}, tableThreadId(table.id));
	if (!stub || !env) return null;
	try {
		const [snapshot, viewer] = await Promise.all([stub.openTable(table.id, url.origin + '/', table.name), chatViewer(request, env).catch(() => null)]);
		return snapshot ? { snapshot, viewer, signinError: url.searchParams.get('signin')?.slice(0, 200) ?? null } : null;
	} catch (e) {
		console.error('Table chat error:', e);
		return null;
	}
}
