import type { InsightSource } from './insight-types';
import { loadPagefind as load, plainExcerpt as plain } from './pagefind';

const MAX_PAGES = 3;
const cache = new Map<string, Promise<InsightSource[]>>();

/** Casey's cag.wiki pages that the site search finds for a topic, best match first. Never rejects. */
export function wikiSourcesFor(topic: string): Promise<InsightSource[]> {
	const key = topic.trim().toLowerCase();
	let found = cache.get(key);
	if (!found) {
		found = (async () => {
			const search = await load();
			if (!search) return [];
			try {
				const response = await search.search(topic, { filters: { Type: 'wiki' } });
				const pages = await Promise.all((response?.results ?? []).slice(0, MAX_PAGES).map((result) => result.data()));
				return pages.map((page) => ({
					url: new URL(page.url.replace(/^\/+(?=https?:)/, ''), 'https://cag.wiki/').href,
					title: page.meta.title ?? page.url,
					page_age: null,
					cited_text: plain(page.excerpt) || null
				}));
			} catch {
				return [];
			}
		})();
		cache.set(key, found);
	}
	return found;
}
