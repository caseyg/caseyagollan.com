import { getPostsByDay, type Post } from '$lib/posts';
import { entryTypes, typeFilterOptions, type PostType } from '$lib/posts-filter';
import { getFeedEntries } from './posts-feed';
import { error } from '@sveltejs/kit';

export const PAGE_SIZE = 20;

export function pageNumber(pageParam: string, totalPages: number): number {
	const page = Number(pageParam);
	if (!/^[1-9]\d*$/.test(pageParam) || !Number.isSafeInteger(page) || page > totalPages) {
		error(404, 'Page not found');
	}
	return page;
}

/** Group a page of feed entries under day headers, newest day first. */
export function postsByDayArray(posts: Post[]): [string, Post[]][] {
	return Array.from(getPostsByDay(posts).entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

export async function loadPostsPage(pageParam = '1') {
	const posts = await getFeedEntries();
	const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
	const page = pageNumber(pageParam, totalPages);
	const typeOptions = typeFilterOptions(posts.map(entryTypes));

	return {
		postsByDay: postsByDayArray(posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)),
		totalPosts: posts.length,
		page,
		totalPages,
		typeOptions,
		selectedTypes: typeOptions.map((option) => option.type) as PostType[]
	};
}
