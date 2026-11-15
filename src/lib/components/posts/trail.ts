import { page } from '$app/state';
import type { MenuOption, Segment } from '$lib/components/ui';

/** The first segment of every trail in the posts section; its emoji matches the corner navigation. */
export const POSTS_CRUMB: Segment = { label: 'Posts', href: '/posts/', icon: '📡' };

/**
 * The Posts segment as a menu of the feed, each post type and each year, when the page loaded one.
 * `active` is the value of the entry for the page being viewed: `all`, a type, or a year.
 */
export function postsCrumb(active?: string): Segment {
	const menu = page.data.postsMenu as MenuOption[] | undefined;
	return menu?.length ? { ...POSTS_CRUMB, menu, menuActive: active ?? '' } : POSTS_CRUMB;
}
