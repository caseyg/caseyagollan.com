import type { Facets } from '$lib/posts-filter';
import { getAllPosts } from '$lib/posts';
import { getTagCounts } from '$lib/server/posts-menu';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	postsMenuSelection: {} as Partial<Facets>,
	tags: getTagCounts(await getAllPosts())
});
