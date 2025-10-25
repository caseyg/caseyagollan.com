import type { PageServerLoad } from './$types';
import { getAllPosts, getPostsByDay } from '$lib/posts';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const { year, month } = params;

	// Validate year and month format
	if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
		throw error(404, 'Not found');
	}

	const allPosts = await getAllPosts();
	const postsInMonth = allPosts.filter(post => post.date.startsWith(`${year}-${month}`));

	if (postsInMonth.length === 0) {
		throw error(404, 'No posts found for this month');
	}

	const postsByDay = getPostsByDay(postsInMonth);
	const postsByDayArray = Array.from(postsByDay.entries()).sort((a, b) =>
		b[0].localeCompare(a[0])
	);

	return {
		year,
		month,
		postsByDay: postsByDayArray,
		totalPosts: postsInMonth.length
	};
};
