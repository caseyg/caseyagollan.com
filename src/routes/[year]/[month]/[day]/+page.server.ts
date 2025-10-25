import type { PageServerLoad } from './$types';
import { getAllPosts } from '$lib/posts';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const { year, month, day } = params;

	// Validate year, month, and day format
	if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
		throw error(404, 'Not found');
	}

	const dateKey = `${year}-${month}-${day}`;
	const allPosts = await getAllPosts();
	const postsOnDay = allPosts.filter(post => post.date.startsWith(dateKey));

	if (postsOnDay.length === 0) {
		throw error(404, 'No posts found for this day');
	}

	return {
		year,
		month,
		day,
		dateKey,
		posts: postsOnDay,
		totalPosts: postsOnDay.length
	};
};
