import { getAllPosts, getPostsByType, getPostsByDay, POST_TYPES, POST_TYPE_PLURALS } from '$lib/posts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const TYPE_ICONS: Record<string, string> = {
	note: '📝',
	article: '📄',
	bookmark: '🔖',
	photo: '📷',
	video: '🎬',
	reply: '💬',
	media: '🎵'
};

export const load: PageServerLoad = async ({ params }) => {
	const { type } = params;

	// Validate type - accept both singular and plural forms
	const singularType = Object.entries(POST_TYPE_PLURALS).find(
		([singular, plural]) => plural === type || singular === type
	)?.[0];

	if (!singularType || !POST_TYPES.includes(singularType as typeof POST_TYPES[number])) {
		throw error(404, `Post type "${type}" not found`);
	}

	const allPosts = await getAllPosts();
	const posts = getPostsByType(allPosts, singularType);
	const postsByDay = getPostsByDay(posts);
	const postsByDayArray = Array.from(postsByDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));

	// Get counts for all types
	const allTypes = POST_TYPES.map((t) => {
		const typePosts = getPostsByType(allPosts, t);
		return {
			value: t,
			label: capitalizeFirst(POST_TYPE_PLURALS[t]),
			href: `/type/${POST_TYPE_PLURALS[t].toLowerCase()}/`,
			count: typePosts.length,
			icon: TYPE_ICONS[t] || '📌'
		};
	}).filter((t) => t.count > 0);

	return {
		type: singularType,
		typeIcon: TYPE_ICONS[singularType] || '📌',
		typePlural: POST_TYPE_PLURALS[singularType],
		postsByDay: postsByDayArray,
		totalPosts: posts.length,
		allTypes
	};
};

function capitalizeFirst(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
