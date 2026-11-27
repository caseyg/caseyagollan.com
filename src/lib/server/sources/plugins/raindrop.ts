/**
 * Raindrop.io: every bookmark outside the trash, with its note, tags, collection and the
 * highlights Casey made on the page. Raindrop keeps a link and an excerpt, not the page: the sync
 * reads thin links' pages afterwards (`fillThin` in `sync.ts`).
 *
 * The first pass, and one a week, lists everything, which is also how a deleted bookmark is
 * noticed. In between, a pass asks Raindrop's search for what changed since the day before the
 * last one (its `lastUpdate:` filter works by day).
 */
import { flat, getJson, host, iso, secret, wantsFull, webUrl } from './http';
import type { SourceDocument, SourcePlugin, SyncStep } from '../types';

const API = 'https://api.raindrop.io/rest/v1';
const PAGE = 50;

interface Cursor { page: number; full: boolean; collections: Record<string, string> }

export interface RaindropRecord {
	_id: number; title?: string | null; excerpt?: string | null; note?: string | null; link?: string | null; domain?: string | null; cover?: string | null; created?: string | null;
	lastUpdate?: string | null; type?: string | null; tags?: string[] | null; important?: boolean | null; collection?: { $id?: number } | null;
	highlights?: { _id?: string; text?: string | null; note?: string | null; created?: string | null }[] | null;
}
interface Collection { _id: number; title?: string; parent?: { $id?: number } | null }

/** Collections by id, nested ones named with their parents. */
async function collections(context: Parameters<SourcePlugin['sync']>[0], headers: Record<string, string>): Promise<Record<string, string>> {
	const [roots, children] = await Promise.all([
		getJson<{ items?: Collection[] }>(context, 'Raindrop', `${API}/collections`, headers),
		getJson<{ items?: Collection[] }>(context, 'Raindrop', `${API}/collections/childrens`, headers)
	]);
	const all = [...(roots.items ?? []), ...(children.items ?? [])];
	const byId = new Map(all.map((collection) => [collection._id, collection]));
	const name = (collection: Collection, depth = 0): string => {
		const parent = collection.parent?.$id && depth < 8 ? byId.get(collection.parent.$id) : undefined;
		return parent ? `${name(parent, depth + 1)} / ${collection.title ?? ''}` : (collection.title ?? 'Untitled');
	};
	return { ...Object.fromEntries(all.map((collection) => [String(collection._id), name(collection)])), '-1': 'Unsorted' };
}

export function raindropDocument(record: RaindropRecord, names: Record<string, string>): SourceDocument | null {
	const url = webUrl(record.link);
	if (!url) return null;
	const place = names[String(record.collection?.$id ?? '')];
	return {
		source: 'raindrop', id: String(record._id), kind: flat(record.type) || 'link', title: flat(record.title) || host(url), url,
		...(flat(record.excerpt) ? { summary: flat(record.excerpt) } : {}), site: flat(record.domain).replace(/^www\./, '') || host(url),
		...(webUrl(record.cover) ? { image: webUrl(record.cover) } : {}), tags: (record.tags ?? []).filter((tag) => typeof tag === 'string' && tag.trim()), places: place ? [place] : [],
		created: iso(record.created), updated: iso(record.lastUpdate), private: true, ...(flat(record.note) ? { note: String(record.note).trim() } : {}),
		highlights: (record.highlights ?? []).filter((highlight) => flat(highlight.text)).map((highlight, index) => ({
			id: highlight._id ?? `${record._id}:${index}`, text: String(highlight.text).trim(), ...(flat(highlight.note) ? { note: flat(highlight.note) } : {}), ...(iso(highlight.created) ? { created: iso(highlight.created) } : {})
		})),
		ref: `raindrop:${record._id}`, ...(record.important ? { extra: { favorite: true } } : {})
	};
}

export const raindrop: SourcePlugin = {
	id: 'raindrop',
	name: 'Raindrop',
	icon: '💧',
	configured: (env) => !!secret(env, 'RAINDROP_TOKEN'),
	async sync(context, state): Promise<SyncStep> {
		const headers = { authorization: `Bearer ${secret(context.env, 'RAINDROP_TOKEN')}` };
		const cursor = (state.cursor as Cursor | undefined) ?? { page: 0, full: wantsFull(state, context.now()), collections: await collections(context, headers) };
		const params = new URLSearchParams({ perpage: String(PAGE), page: String(cursor.page), sort: '-created' });
		// A day early: the filter compares days, and a bookmark listed twice is only written twice.
		if (!cursor.full && state.since) params.set('search', `lastUpdate:>${new Date(Date.parse(state.since) - 86_400_000).toISOString().slice(0, 10)}`);
		const data = await getJson<{ items?: RaindropRecord[] }>(context, 'Raindrop', `${API}/raindrops/0?${params}`, headers);
		const items = data.items ?? [];
		const documents = items.flatMap((record) => { const document = raindropDocument(record, cursor.collections); return document ? [{ document, raw: record }] : []; });
		return items.length === PAGE ? { documents, cursor: { ...cursor, page: cursor.page + 1 }, done: false } : { documents, done: true, complete: cursor.full };
	}
};
