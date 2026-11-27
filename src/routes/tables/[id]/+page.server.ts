import { error, redirect } from '@sveltejs/kit';
import { readTable } from '$lib/server/tables';
import { chatViewer } from '$lib/server/chat/identity';
import { threadStub } from '$lib/server/chat/threads';
import { tableThreadId } from '$lib/table-agent';
import { CHAT_OWNER_ONLY } from '$lib/chat';
import { isOwner } from '$lib/server/tables-api';
import { isPublished, validId, type Table } from '$lib/tables';
import { keepPass, passFor, PASS_COOKIE, PASS_COOKIE_OPTIONS, PASS_PARAM } from '$lib/server/table-pass';
import type { PageServerLoad } from './$types';

export const prerender = false;

/**
 * A saved table, or null for one that only exists in a browser's demo (`?owner=demo` away from
 * caseyagollan.com), which the page then reads from local storage.
 */
export const load: PageServerLoad = async ({ params, platform, url, setHeaders, request, cookies }) => {
	if (!validId(params.id)) error(404, 'No such table');
	const state = platform?.env?.PUBLISHING_STATE;
	// A link from the Claude connector: this browser keeps its pass, and the pass leaves the address.
	if (url.searchParams.has(PASS_PARAM)) {
		const kept = await keepPass(state, request, params.id, url.searchParams.get(PASS_PARAM));
		if (kept) cookies.set(PASS_COOKIE, kept, PASS_COOKIE_OPTIONS);
		const clean = new URL(url);
		clean.searchParams.delete(PASS_PARAM);
		redirect(303, clean.pathname + clean.search);
	}
	const table = await readTable(state, params.id);
	const owner = await isOwner(request, platform?.env);
	// A pass lets this browser see the table, and change it where the pass says so; the owner needs none.
	const held = table && !owner ? await passFor(request, state, table.id) : null;
	const pass = held ? { edit: held.edit, ...(held.edit ? { csrf: held.csrf } : {}) } : null;
	// A draft is the owner's alone: anyone else finds nothing here.
	if (table && !isPublished(table)) {
		if (!owner && !pass) error(404, 'No such table');
		setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
		return { id: params.id, table, pass, chat: await tableChat(table, request, platform?.env, url) };
	}
	const demo = url.searchParams.get('owner') === 'demo' && url.hostname !== 'caseyagollan.com';
	if (!table && !demo) error(404, 'No such table');
	const chat = table ? await tableChat(table, request, platform?.env, url) : null;
	// Who is signed in to the chat changes the page, so it isn't shared between people.
	setHeaders({ 'cache-control': chat || pass ? 'private, no-cache' : 'no-cache' });
	return { id: params.id, table, pass, chat };
};

/** The table's chat thread (made on first visit) and who is reading it; null where chat isn't set up. */
async function tableChat(table: Table, request: Request, env: App.Platform['env'] | undefined, url: URL) {
	const stub = threadStub(env ?? {}, tableThreadId(table.id));
	if (!stub || !env) return null;
	try {
		const viewer = await chatViewer(request, env).catch(() => null);
		// Owner-only for now: visitors get no overlay, and no thread is made for them.
		if (CHAT_OWNER_ONLY && !viewer?.owner) return null;
		const snapshot = await stub.openTable(table.id, url.origin + '/', table.name);
		return snapshot ? { snapshot, viewer, signinError: url.searchParams.get('signin')?.slice(0, 200) ?? null } : null;
	} catch (e) {
		console.error('Table chat error:', e);
		return null;
	}
}
