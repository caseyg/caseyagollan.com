import type { WikiPage, WikiPageSummary } from './types';

/** A page as a stacked pane shows it, served at /wiki/<slug>/page.json. */
export type WikiPaneData = Pick<WikiPage, 'slug' | 'title' | 'url' | 'tags' | 'year' | 'fields' | 'html'> & {
	backlinks: Pick<WikiPageSummary, 'slug' | 'title' | 'excerpt'>[];
};

/** The query parameter that lists the panes open beside a page, so a stack can be shared and reloaded. */
export const STACK_PARAM = 'stack';

/** Pane slugs from a page address, in order. */
export function stackFromUrl(url: URL): string[] {
	return url.searchParams.getAll(STACK_PARAM).filter(Boolean);
}

/** The page's address with `stack` as its open panes. */
export function urlWithStack(url: URL, stack: string[]): URL {
	const next = new URL(url);
	next.searchParams.delete(STACK_PARAM);
	for (const slug of stack) next.searchParams.append(STACK_PARAM, slug);
	return next;
}

/**
 * The stack after following a link to `slug` from the pane at `from` (0 is the page itself): the
 * panes after it close and the new one opens beside it. A page that is already open to the left is
 * shown where it is instead, so `focus` is the pane to bring into view.
 */
export function openInStack(root: string, stack: string[], from: number, slug: string): { stack: string[]; focus: number } {
	const open = [root, ...stack];
	const existing = open.indexOf(slug);
	if (existing >= 0 && existing <= from) return { stack, focus: existing };
	if (open[from + 1] === slug) return { stack, focus: from + 1 };
	return { stack: [...stack.slice(0, from), slug], focus: from + 1 };
}

const panes = new Map<string, Promise<WikiPaneData | null>>();

/** One request per page. Never rejects. */
export function loadPane(slug: string): Promise<WikiPaneData | null> {
	let pane = panes.get(slug);
	if (!pane) {
		pane = fetch(`/wiki/${slug}/page.json`)
			.then((response) => (response.ok ? (response.json() as Promise<WikiPaneData>) : null))
			.catch(() => null);
		panes.set(slug, pane);
	}
	return pane;
}
