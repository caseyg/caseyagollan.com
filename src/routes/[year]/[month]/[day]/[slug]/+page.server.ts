import type { PageServerLoad } from './$types';
import { getAllPosts } from '$lib/posts';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const { year, month, day, slug } = params;

	// Validate year, month, and day format
	if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
		throw error(404, 'Not found');
	}

	const dateKey = `${year}-${month}-${day}`;
	const allPosts = await getAllPosts();

	// Find post matching the date and slug
	const post = allPosts.find(p => p.date.startsWith(dateKey) && p.slug === slug);

	if (!post) {
		throw error(404, 'Post not found');
	}

	return {
		year,
		month,
		day,
		post
	};
};
