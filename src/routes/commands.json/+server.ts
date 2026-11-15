import { json } from '@sveltejs/kit';
import { getPostsMenu } from '$lib/server/posts-menu';

export const prerender = true;

/** The command palette's post types and years, fetched when it first opens. */
export async function GET() {
	return json({ posts: await getPostsMenu() });
}
