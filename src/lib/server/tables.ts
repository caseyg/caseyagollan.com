import { byUpdated, isPublished, toSummary, validId, type Table, type TableSummary } from '../tables';

/*
 * Tables live in the publishing-state bucket beside the graph curation: one object per table, and
 * an index of their summaries so the browse page reads a single object. Previews get their own bucket.
 */
const INDEX = 'tables/index.json';
const tableKey = (id: string) => `tables/${id}.json`;
const thumbnailKey = (id: string) => `tables/${id}.svg`;
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

export async function writeThumbnail(bucket: R2Bucket, id: string, svg: string): Promise<void> {
	await bucket.put(thumbnailKey(id), svg, { httpMetadata: { contentType: 'image/svg+xml' } });
}

export async function readThumbnail(bucket: R2Bucket | undefined, id: string): Promise<string | null> {
	if (!bucket || !validId(id)) return null;
	const object = await bucket.get(thumbnailKey(id)).catch(() => null);
	return object ? object.text() : null;
}
