import { ownerHint } from './owner';
import { searchBlocks } from './table-sources';
import { tableWireframe } from './table-wireframe';
import { byUpdated, cleanName, emptyTable, linkBlock, summarizeDocument, toSummary, validId, type Block, type Table, type TableSummary } from './tables';

/**
 * Who is looking at tables, and where changes go: the signed-in owner saves to the site, `demo`
 * (`?owner=demo` away from caseyagollan.com, where sign-in is off) saves in this browser only,
 * and visitors only look.
 */
export type TablesMode = 'owner' | 'demo' | 'visitor';

export interface TablesSession {
	mode: TablesMode;
	csrf?: string;
	/** The owner's tables, drafts included. */
	tables?: TableSummary[];
}

const DEMO_FLAG = 'tables-demo';
const DEMO_STORE = 'tables-demo-store';

/** Remembers `?owner=demo` for this tab, so moving between tables keeps it. */
function demoRequested(): boolean {
	if (location.hostname === 'caseyagollan.com') return false;
	try {
		if (new URLSearchParams(location.search).get('owner') === 'demo') sessionStorage.setItem(DEMO_FLAG, '1');
		return sessionStorage.getItem(DEMO_FLAG) === '1';
	} catch {
		return new URLSearchParams(location.search).get('owner') === 'demo';
	}
}

export async function tablesSession(): Promise<TablesSession> {
	if (ownerHint()) {
		try {
			const response = await fetch('/api/tables?owner', { credentials: 'same-origin' });
			const data = (await response.json()) as { owner?: boolean; csrf?: string; tables?: TableSummary[] };
			if (response.ok && data.owner && data.csrf) return { mode: 'owner', csrf: data.csrf, tables: data.tables };
		} catch {
			/* Fall through: without a session the page is read-only. */
		}
	}
	return { mode: demoRequested() ? 'demo' : 'visitor' };
}

async function send<T>(session: TablesSession, method: string, path: string, body: unknown): Promise<T> {
	const response = await fetch(path, {
		method,
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrf ?? '' },
		body: JSON.stringify(body)
	});
	const data = (await response.json().catch(() => ({}))) as T & { error?: string };
	if (!response.ok) throw new Error(data.error || 'The table couldn’t be saved.');
	return data;
}

/* The demo keeps whole tables in localStorage. It can be unavailable; then nothing persists. */

interface DemoTable extends Table {
	/** Blocks to set out when the sample table first opens. */
	seed?: Block[];
}

function demoStore(): Record<string, DemoTable> {
	try {
		return JSON.parse(localStorage.getItem(DEMO_STORE) ?? '{}') as Record<string, DemoTable>;
	} catch {
		return {};
	}
}

function writeDemo(store: Record<string, DemoTable>) {
	try {
		localStorage.setItem(DEMO_STORE, JSON.stringify(store));
	} catch {
		/* Full or blocked: changes last as long as the page. */
	}
}

/** A first table for the demo, set with real posts, books, wiki pages and Are.na blocks from the search index. */
async function sampleTable(): Promise<DemoTable> {
	const [posts, books, wiki, arena] = await Promise.all([searchBlocks('changelog', 'post', 2), searchBlocks('', 'book', 40), searchBlocks('', 'wiki', 2), searchBlocks('', 'arena', 40)]);
	const covers = (books ?? []).filter((book) => book.image).slice(0, 3);
	const pictures = (arena ?? []).filter((block) => block.image).slice(0, 2);
	const link = linkBlock('https://tabletop.grantcuster.com');
	const seed = [...(posts ?? []), ...covers, ...(wiki ?? []), ...pictures, ...(link ? [link] : [])];
	return { ...emptyTable('Sample table'), seed, published: true };
}

export async function listDemoTables(): Promise<TableSummary[]> {
	const store = demoStore();
	if (!Object.keys(store).length) {
		const sample = await sampleTable();
		store[sample.id] = sample;
		writeDemo(store);
	}
	return Object.values(store).map(({ seed: _seed, ...table }) => toSummary(table)).sort(byUpdated);
}

export function readDemoTable(id: string): DemoTable | null {
	return validId(id) ? (demoStore()[id] ?? null) : null;
}

/** Creates a table and returns it. */
export async function createTable(session: TablesSession, name = 'Untitled table'): Promise<Table> {
	if (session.mode === 'demo') {
		const table = emptyTable(cleanName(name) ?? 'Untitled table');
		writeDemo({ ...demoStore(), [table.id]: table });
		return table;
	}
	return (await send<{ table: Table }>(session, 'POST', '/api/tables', { name })).table;
}

/** Saves a rename, a canvas, publishing, or several together, and returns the table's new summary. */
export async function saveTable(session: TablesSession, id: string, change: { name?: string; document?: unknown; published?: boolean }): Promise<TableSummary> {
	if (session.mode === 'demo') {
		const store = demoStore();
		const current = store[id] ?? emptyTable('Untitled table', id);
		const next: DemoTable = { ...current, updated: new Date().toISOString() };
		if (change.name !== undefined) next.name = cleanName(change.name) ?? current.name;
		if (change.published !== undefined) next.published = change.published;
		if (change.document !== undefined) {
			next.document = change.document;
			delete next.seed;
			Object.assign(next, summarizeDocument(change.document));
		}
		writeDemo({ ...store, [id]: next });
		const { seed: _seed, ...table } = next;
		return toSummary(table);
	}
	return (await send<{ table: TableSummary }>(session, 'PUT', `/api/tables/${id}`, change)).table;
}

/** Keeps `?owner=demo` on links between tables in the demo, so a copied link works the same. */
export const tableHref = (id: string, mode: TablesMode) => `/tables/${id}/${mode === 'demo' ? '?owner=demo' : ''}`;

/** Where a table's picture comes from: drawn by the server from the saved canvas, or here in the demo. */
export function thumbnailUrl(table: TableSummary, mode: TablesMode): string | undefined {
	if (mode === 'demo') {
		const svg = tableWireframe(readDemoTable(table.id)?.document);
		return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : undefined;
	}
	return `/api/tables/${table.id}/thumbnail?v=${encodeURIComponent(table.updated)}`;
}
