/** The parts of Pagefind's browser API the site uses; the bundle is built into /pagefind/ by utils/build-search.ts. */
export interface Pagefind {
	options(options: Record<string, unknown>): Promise<void>;
	search(term: string | null, options?: { filters?: Record<string, string | string[]> }): Promise<{ results: { score: number; data(): Promise<PagefindData> }[] } | null>;
	debouncedSearch?(term: string | null, options?: { filters?: Record<string, string | string[]> }, ms?: number): Promise<{ results: { score: number; data(): Promise<PagefindData> }[] } | null>;
}
export interface PagefindData {
	url: string;
	excerpt: string;
	meta: Record<string, string | undefined> & { title?: string };
}

let pagefind: Promise<Pagefind | null> | undefined;

/** Loads the search bundle once. Resolves null where there is none, such as `vite dev` before a search build. */
export function loadPagefind(): Promise<Pagefind | null> {
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

/** An excerpt's text without Pagefind's `<mark>` tags and entities. */
export const plainExcerpt = (html: string) =>
	html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();
