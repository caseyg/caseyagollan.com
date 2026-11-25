import { error } from '@sveltejs/kit';
import { getAllPosts, getPostPermalink } from '$lib/posts';
import { isPublicPost } from '$lib/server/parse-post';
import { SOURCE_POST_TYPES } from '$lib/table-post-source';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

const sourcePosts = async () => (await getAllPosts()).filter((post) => isPublicPost(post) && SOURCE_POST_TYPES.has(post.type));

/** Notes, replies, likes and reposts: the posts a table draws as they read on their source. */
export const entries: EntryGenerator = async () =>
	(await sourcePosts()).map((post) => {
		const [, year, month, day, slug] = getPostPermalink(post).split('/');
		return { year, month, day, slug };
	});

/** One post, as the feed's chunks give it, for a table block that draws it like the Bluesky or Mastodon post it is. */
export const GET: RequestHandler = async ({ params }) => {
	const path = `/${params.year}/${params.month}/${params.day}/${params.slug}/`;
	const post = (await sourcePosts()).find((candidate) => getPostPermalink(candidate) === path);
	if (!post) error(404, 'Not found');
	return Response.json(post);
};
