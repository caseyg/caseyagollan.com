import { getAllPosts, getPostsByDay } from '$lib/posts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const posts = await getAllPosts();
	const postsByDay = getPostsByDay(posts);

	// Convert Map to array of [dateKey, posts] for easier iteration in Svelte
	const postsByDayArray = Array.from(postsByDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));

	return {
		postsByDay: postsByDayArray,
		totalPosts: posts.length
	};
};
