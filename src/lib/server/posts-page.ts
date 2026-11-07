import { getAllPosts, getPostsByDay, rollupIndexPosts } from '$lib/posts';
import { error } from '@sveltejs/kit';

export const PAGE_SIZE = 20;

export async function loadPostsPage(pageParam = '1') {
	const posts = rollupIndexPosts(await getAllPosts());
	const page = Number(pageParam);
	const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
	if (!/^[1-9]\d*$/.test(pageParam) || !Number.isSafeInteger(page) || page > totalPages) {
		error(404, 'Page not found');
	}
	const postsByDay = getPostsByDay(posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	// Convert Map to array of [dateKey, posts] for easier iteration in Svelte
	const postsByDayArray = Array.from(postsByDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));

	return {
		postsByDay: postsByDayArray,
		totalPosts: posts.length,
		page,
		totalPages
	};
}
