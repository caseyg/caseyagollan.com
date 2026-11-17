import { browser } from '$app/environment';
import { facetMenu, type Facets, type PostType } from '$lib/posts-filter';
import type { MenuOption } from '$lib/components/ui';

/** The prerendered feed index the filtered feed also reads: each entry's types, tags and year. */
const INDEX_URL = '/posts/feed-data/index.json';
interface MenuIndex {
	entries: PostType[][];
	tags: string[][];
	years: string[];
	tagNames: Record<string, string>;
}

/**
 * Pages send only what they stand for (`postsMenuSelection`), and the Posts menu with its counts is
 * built here from one shared file. Baking the counts into every page meant one new post rewrote
 * thousands of prerendered pages, and the deploy re-uploaded them all.
 */
let index = $state<MenuIndex | undefined>();
let requested = false;

function load() {
	if (!browser || requested) return;
	requested = true;
	fetch(INDEX_URL)
		.then((response) => (response.ok ? (response.json() as Promise<MenuIndex>) : undefined))
		.then((data) => {
			if (data) index = data;
			else requested = false;
		})
		.catch(() => (requested = false));
}

/** The Posts menu for a page's selection, once the index has loaded; undefined until then and on the server. */
export function postsMenuFor(selection: Partial<Facets> | undefined): MenuOption[] | undefined {
	if (!selection) return undefined;
	load();
	if (!index) return undefined;
	const { entries, tags, years, tagNames } = index;
	return facetMenu(entries.map((types, i) => ({ types, tags: tags[i], year: years[i] })), tagNames, selection);
}
