import { loadPostsPage } from '$lib/server/posts-page';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadPostsPage();
