/**
 * Casey's Raindrop.io bookmarks, searched for the signed-in owner only with the `RAINDROP_TOKEN`
 * Worker secret. Raindrop searches on its side, so nothing is copied or cached here, and none of it
 * goes in the public search index.
 */
import type { Block } from '$lib/tables';

const API = 'https://api.raindrop.io/rest/v1';
const LIMIT = 24;

/** The fields this reads from a Raindrop item. */
export interface Raindrop {
	_id: number;
	title?: string | null;
	excerpt?: string | null;
	note?: string | null;
	link?: string | null;
	domain?: string | null;
	cover?: string | null;
	created?: string | null;
	type?: string | null;
	tags?: string[] | null;
}

const ICON: Record<string, string> = { link: '💧', article: '📄', image: '🖼️', video: '🎬', document: '📎', audio: '🎵' };

/** A bookmark as a table block: it opens the bookmarked page, and says it came from Raindrop. */
export function raindropBlock(item: Raindrop): Block | null {
	const url = item.link?.trim();
	if (!url || !/^https?:\/\//i.test(url)) return null;
	const domain = (item.domain || new URL(url).hostname).replace(/^www\./, '');
	const date = item.created?.slice(0, 10);
	const excerpt = [item.excerpt, item.note].map((text) => text?.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ').slice(0, 300) || undefined;
	const cover = item.cover && /^https:\/\//i.test(item.cover) ? item.cover : undefined;
	return {
		kind: 'raindrop',
		url,
		title: item.title?.trim() || domain,
		meta: ['Raindrop', domain, date].filter(Boolean).join(' · '),
		excerpt,
		image: cover,
		icon: ICON[item.type ?? ''] ?? '💧',
		...(Number.isSafeInteger(item._id) && item._id > 0 ? { ref: `raindrop:${item._id}` } : {})
	};
}

/**
 * Bookmarks in every collection (not the trash) matching `query` in Raindrop's own search syntax,
 * best match first; an empty query lists the newest.
 */
export async function searchRaindrop(token: string, query: string, limit = LIMIT, fetcher: typeof fetch = fetch): Promise<Block[]> {
	const params = new URLSearchParams({ perpage: String(Math.min(Math.max(limit, 1), 50)), page: '0', sort: query.trim() ? 'score' : '-created' });
	if (query.trim()) params.set('search', query.trim());
	const response = await fetcher(`${API}/raindrops/0?${params}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
	if (!response.ok) throw new Error(`Raindrop: ${response.status}`);
	const data = (await response.json()) as { items?: Raindrop[] };
	return (data.items ?? []).map(raindropBlock).filter((block) => block !== null);
}
