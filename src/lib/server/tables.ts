import { byUpdated, isPublished, toSummary, validId, type Table, type TableSummary } from '../tables';
import { searchTableTexts, tableTexts, type TableSearchResult, type TableText } from '../table-search';

/*
 * Tables live in the publishing-state bucket beside the graph curation: one object per table, and
 * an index of their summaries so the browse page reads a single object.
 */
const INDEX = 'tables/index.json';
const SEARCH = 'tables/search.json';
const tableKey = (id: string) => `tables/${id}.json`;
const JSON_TYPE = { httpMetadata: { contentType: 'application/json' } };

/** Published tables, for visitors. */
export async function listPublishedTables(bucket: R2Bucket | undefined): Promise<TableSummary[]> {
	return (await listTables(bucket)).filter(isPublished);
}

/** Every table, drafts included: the owner's view, and what writes keep the index of. */
export async function listTables(bucket: R2Bucket | undefined): Promise<TableSummary[]> {
	if (!bucket) return [];
	try {
		const object = await bucket.get(INDEX);
		const list = object ? ((await object.json()) as unknown) : [];
		return Array.isArray(list) ? (list as TableSummary[]).filter((entry) => validId(entry?.id)).sort(byUpdated) : [];
	} catch (e) {
		console.error('Tables index read error:', e);
		return [];
	}
}

export async function readTable(bucket: R2Bucket | undefined, id: string): Promise<Table | null> {
	if (!bucket || !validId(id)) return null;
	try {
		const object = await bucket.get(tableKey(id));
		return object ? ((await object.json()) as Table) : null;
	} catch (e) {
		console.error('Table read error:', e);
		return null;
	}
}

/** Writes the table, then its line in the index. */
export async function writeTable(bucket: R2Bucket, table: Table): Promise<TableSummary[]> {
	await bucket.put(tableKey(table.id), JSON.stringify(table), JSON_TYPE);
	const list = (await listTables(bucket)).filter((entry) => entry.id !== table.id);
	const next = [toSummary(table), ...list].sort(byUpdated);
	await bucket.put(INDEX, JSON.stringify(next), JSON_TYPE);
	return next;
}

/** What each table says, kept beside the index so a search reads one object, not every table. */
type SearchIndex = Record<string, { updated: string; texts: TableText[] }>;
/** How many changed tables one search reads again; the rest wait for the next. */
const SEARCH_REFRESH = 25;

/**
 * The things on tables that hold the typed words. The words kept for a table are read again once
 * it has changed, so nothing has to be done when a table is saved. Visitors search published
 * tables only; `drafts` adds the owner's.
 */
export async function searchTables(bucket: R2Bucket | undefined, query: string, drafts = false): Promise<TableSearchResult[]> {
	if (!bucket) return [];
	const tables = await listTables(bucket);
	let kept: SearchIndex = {};
	try {
		const object = await bucket.get(SEARCH);
		const value = object ? ((await object.json()) as unknown) : null;
		if (value && typeof value === 'object' && !Array.isArray(value)) kept = value as SearchIndex;
	} catch (e) {
		console.error('Tables search index read error:', e);
	}
	const stale = tables.filter((table) => kept[table.id]?.updated !== table.updated).slice(0, SEARCH_REFRESH);
	const gone = Object.keys(kept).filter((id) => !tables.some((table) => table.id === id));
	if (stale.length || gone.length) {
		const read = await Promise.all(stale.map(async (table) => [table, await readTable(bucket, table.id)] as const));
		const next: SearchIndex = { ...kept };
		for (const id of gone) delete next[id];
		for (const [table, full] of read) if (full) next[table.id] = { updated: table.updated, texts: tableTexts(full.document) };
		kept = next;
		await bucket.put(SEARCH, JSON.stringify(next), JSON_TYPE).catch((e) => console.error('Tables search index write error:', e));
	}
	const searched = tables.filter((table) => drafts || isPublished(table)).map((table) => ({ table, texts: kept[table.id]?.texts ?? [] }));
	return searchTableTexts(searched, query);
}
