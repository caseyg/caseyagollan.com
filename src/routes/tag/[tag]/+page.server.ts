import { getAllPosts, getPostsByTag, getPostsByDay, getAllTags } from '$lib/posts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { tag } = params;

	const allPosts = await getAllPosts();
	const posts = getPostsByTag(allPosts, tag);

	if (posts.length === 0) {
		throw error(404, `No posts found with tag "${tag}"`);
	}

	const postsByDay = getPostsByDay(posts);
	const postsByDayArray = Array.from(postsByDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));

	// Get all tags with counts, sorted by count descending
	const tagCounts = getAllTags(allPosts);
	const allTags = Array.from(tagCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([tagName, count]) => ({
			value: tagName,
			label: `#${tagName}`,
			href: `/tag/${tagName.toLowerCase()}/`,
			count
		}));

	return {
		tag,
		postsByDay: postsByDayArray,
		totalPosts: posts.length,
		allTags
	};
};
