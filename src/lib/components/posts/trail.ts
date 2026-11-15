import { page } from '$app/state';
import type { MenuOption, Segment } from '$lib/components/ui';
import { toggleTypes, type PostType, type TypeFilterOption } from '$lib/posts-filter';

/** The first segment of every trail in the posts section; its emoji matches the corner navigation. */
export const POSTS_CRUMB: Segment = { label: 'Posts', href: '/posts/', icon: '📡' };

/** Leads from a tag's page to the page of all tags. */
export const TAGS_CRUMB: Segment = { label: 'Tags', href: '/tag/', icon: '🏷️' };

/** The post types a page can be narrowed to, the ones shown now, and the URL for any selection. */
export interface TrailFilter {
	options: TypeFilterOption[];
	/** Types currently shown; every option when nothing is filtered. */
	selected: PostType[];
	href: (types: PostType[]) => string;
}

/**
 * The Posts segment as a menu of the feed, each post type and each year, when the page loaded one.
 * `active` is the value of the entry for the page being viewed: `all`, a type, or a year.
 * On a page that lists posts of several types, pass `filter`: the types become check boxes that
 * narrow that page, and can be combined.
 */
export function postsCrumb(active?: string, filter?: TrailFilter): Segment {
	const menu = page.data.postsMenu as MenuOption[] | undefined;
	if (!menu?.length) return POSTS_CRUMB;
	if (!filter || filter.options.length < 2) return { ...POSTS_CRUMB, menu, menuActive: active ?? '' };

	const available = filter.options.map((option) => option.type);
	const shown = new Set(filter.selected);
	const filtered = shown.size < available.length;
	const group = 'Filter by type';
	const types: MenuOption[] = filter.options.map((option) => ({
		value: option.type,
		label: option.label,
		icon: option.icon,
		count: option.count,
		href: filter.href(toggleTypes(option.type, shown, available)),
		checked: filtered && shown.has(option.type),
		group
	}));
	if (filtered) types.push({ value: 'every-type', label: 'Show all types', href: filter.href([...available]), group });
	const chosen = filter.options.filter((option) => shown.has(option.type));
	return {
		...POSTS_CRUMB,
		menu: [...menu.filter((option) => !option.group), ...types, ...menu.filter((option) => option.group && option.group !== 'By type')],
		menuActive: filtered ? '' : (active ?? ''),
		menuBadge: !filtered ? undefined : chosen.length === 1 ? chosen[0].label : `${chosen.length} types`
	};
}
