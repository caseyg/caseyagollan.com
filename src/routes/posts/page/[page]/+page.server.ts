import { getAllPosts, rollupIndexPosts } from '$lib/posts';
import { loadPostsPage, PAGE_SIZE } from '$lib/server/posts-page';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = async () => {
	const posts = rollupIndexPosts(await getAllPosts());
	return Array.from({ length: Math.max(0, Math.ceil(posts.length / PAGE_SIZE) - 1) }, (_, i) => ({
		page: String(i + 2)
	}));
};

export const load: PageServerLoad = ({ params }) => loadPostsPage(params.page);
