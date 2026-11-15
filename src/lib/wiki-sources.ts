import type { InsightSource } from './insight-types';

/** The parts of Pagefind's browser API used here; the bundle is built into /pagefind/ by utils/build-search.ts. */
interface Pagefind {
	options(options: Record<string, unknown>): Promise<void>;
	search(term: string, options?: { filters?: Record<string, string> }): Promise<{ results: { score: number; data(): Promise<PagefindData> }[] } | null>;
}
interface PagefindData {
	url: string;
	excerpt: string;
	meta: { title?: string };
}

const MAX_PAGES = 3;
let pagefind: Promise<Pagefind | null> | undefined;
const cache = new Map<string, Promise<InsightSource[]>>();

function load(): Promise<Pagefind | null> {
	pagefind ??= (async () => {
		try {
			const path = '/pagefind/pagefind.js';
			const module = (await import(/* @vite-ignore */ path)) as Pagefind;
			await module.options({ baseUrl: '/' });
			return module;
		} catch {
			return null;
		}
	})();
	return pagefind;
}

const plain = (html: string) =>
	html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();

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
