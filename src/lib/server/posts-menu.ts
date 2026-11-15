import { getAllTags, type Post } from '$lib/posts';
import { facetMenu, type Facets } from '$lib/posts-filter';
import type { MenuOption } from '$lib/components/ui';
import { buildFeedIndex, getFeedEntries, indexFacetEntries } from './posts-feed';

export interface TagCount {
	name: string;
	href: string;
	count: number;
}

/** Every tag with its post count, most used first. Tags that differ only by case share a page, so they are one entry. */
export function getTagCounts(posts: Post[]): TagCount[] {
	const tags = new Map<string, TagCount>();
	for (const [name, count] of getAllTags(posts)) {
		const key = name.toLowerCase();
		const entry = tags.get(key);
		if (entry) entry.count += count;
		else tags.set(key, { name, href: `/tags/${key}/`, count });
	}
	return [...tags.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * The Posts menu shown at the start of every trail in the posts section. `selection` is what the page
 * being built already stands for, e.g. its year or tag, so the menu opens with that checked.
 */
export async function getPostsMenu(selection: Partial<Facets> = {}): Promise<MenuOption[]> {
	const index = buildFeedIndex(await getFeedEntries());
	return facetMenu(indexFacetEntries(index), index.tagNames, selection);
}
