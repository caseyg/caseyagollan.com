import { getAllPosts, getAllTags, getPostsByType, POST_TYPES, POST_TYPE_PLURALS, type Post } from '$lib/posts';
import { TYPE_ICONS } from '$lib/posts-filter';
import type { MenuOption } from '$lib/components/ui';

/** Tags shown in the Posts menu before it hands over to the page of all tags. */
const MENU_TAGS = 6;

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
		else tags.set(key, { name, href: `/tag/${key}/`, count });
	}
	return [...tags.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The Posts menu shown at the start of every trail in the posts section: the feed, each type, the most used tags, then each year. */
export async function getPostsMenu(): Promise<MenuOption[]> {
	const posts = await getAllPosts();
	const types = POST_TYPES.map((type) => {
		const plural = POST_TYPE_PLURALS[type];
		return {
			value: type,
			label: plural.charAt(0).toUpperCase() + plural.slice(1),
			href: `/type/${plural.toLowerCase()}/`,
			count: getPostsByType(posts, type).length,
			icon: TYPE_ICONS[type] ?? '📌',
			group: 'By type'
		};
	}).filter((option) => option.count > 0);

	const perYear = new Map<string, number>();
	for (const post of posts) {
		const year = post.date.slice(0, 4);
		perYear.set(year, (perYear.get(year) ?? 0) + 1);
	}
	const years = [...perYear.entries()]
		.sort((a, b) => b[0].localeCompare(a[0]))
		.map(([year, count]) => ({ value: year, label: year, href: `/${year}/`, count, group: 'By year' }));

	const allTags = getTagCounts(posts);
	const tags: MenuOption[] = allTags
		.slice(0, MENU_TAGS)
		.map((tag) => ({ value: `tag:${tag.name.toLowerCase()}`, label: `#${tag.name}`, href: tag.href, count: tag.count, group: 'By tag' }));
	if (allTags.length) tags.push({ value: 'tags', label: 'All tags', href: '/tag/', count: allTags.length, icon: '🏷️', group: 'By tag' });

	return [{ value: 'all', label: 'All posts', href: '/posts/', icon: '📡' }, ...types, ...tags, ...years];
}
