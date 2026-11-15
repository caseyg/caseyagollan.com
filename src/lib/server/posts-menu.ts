import { getAllPosts, getPostsByType, POST_TYPES, POST_TYPE_PLURALS } from '$lib/posts';
import { TYPE_ICONS } from '$lib/posts-filter';
import type { MenuOption } from '$lib/components/ui';

/** The Posts menu shown at the start of every trail in the posts section: the feed, each type, then each year. */
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

	return [{ value: 'all', label: 'All posts', href: '/posts/', icon: '📡' }, ...types, ...years];
}
