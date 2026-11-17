import { page } from '$app/state';
import type { MenuOption, Segment } from '$lib/components/ui';
import type { Facets } from '$lib/posts-filter';
import { postsMenuFor } from './posts-menu.svelte';

/** The first segment of every trail in the posts section; its emoji matches the corner navigation. */
export const POSTS_CRUMB: Segment = { label: 'Posts', href: '/posts/', icon: '📡' };

/** Leads from a tag's page to the page of all tags. */
export const TAGS_CRUMB: Segment = { label: 'Tags', href: '/tags/', icon: '🏷️' };

/**
 * The Posts segment as the menu the page loaded: the feed, then post types, tags and years to combine.
 * `active` marks a plain entry as the page being viewed (`all` or `tags`), and `badge` says which
 * filters are in effect when the trail does not already.
 */
export function postsCrumb(active?: string, badge?: string): Segment {
	// The filtered feed builds its own menu; prerendered pages name their selection and the menu loads after.
	const menu = (page.data.postsMenu as MenuOption[] | undefined) ?? postsMenuFor(page.data.postsMenuSelection as Partial<Facets> | undefined);
	return menu?.length ? { ...POSTS_CRUMB, menu, menuActive: active ?? '', menuBadge: badge } : POSTS_CRUMB;
}
