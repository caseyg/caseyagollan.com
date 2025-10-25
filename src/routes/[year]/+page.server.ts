import type { PageServerLoad } from './$types';
import { getAllPosts, getPostsByDay } from '$lib/posts';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const year = params.year;

	// Validate year format
	if (!/^\d{4}$/.test(year)) {
		throw error(404, 'Not found');
	}

	const allPosts = await getAllPosts();
	const postsInYear = allPosts.filter(post => post.date.startsWith(year));

	if (postsInYear.length === 0) {
		throw error(404, 'No posts found for this year');
	}

	const postsByDay = getPostsByDay(postsInYear);
	const postsByDayArray = Array.from(postsByDay.entries()).sort((a, b) =>
		b[0].localeCompare(a[0])
	);

	return {
		year,
		postsByDay: postsByDayArray,
		totalPosts: postsInYear.length
	};
};
