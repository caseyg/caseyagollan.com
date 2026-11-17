import { getAllPosts, getPostPermalink } from '$lib/posts';
import { movedPost } from '$lib/post-slug';

export { movedPost };

/** The current address of a renamed post, ready for a Location header, plus an optional subpage such as edit/. */
export async function renamedPermalink(params: { year: string; month: string; day: string; slug: string }, subpage = ''): Promise<string | undefined> {
	const post = movedPost(await getAllPosts(), params);
	return post ? encodeURI(getPostPermalink(post) + subpage) : undefined;
}
