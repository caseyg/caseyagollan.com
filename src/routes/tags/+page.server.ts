import { getAllPosts } from '$lib/posts';
import { getPostsMenu, getTagCounts } from '$lib/server/posts-menu';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	postsMenu: await getPostsMenu(),
	tags: getTagCounts(await getAllPosts())
});
