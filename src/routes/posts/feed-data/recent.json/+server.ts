import { getAllPosts, getPostPermalink } from '$lib/posts';
import { isPublicPost } from '$lib/server/parse-post';
import { FEED_MAX_DAYS, type FeedItem } from '$lib/table-feed';
import { blockFromPost } from '$lib/table-post-source';

export const prerender = true;

/** As many posts as the list holds, however busy the month. */
const MAX_POSTS = 600;

/**
 * The site's latest posts as table blocks with their times, newest first: the month before the
 * newest post. The tables Add menu reads it for its feed of recent things.
 */
export async function GET() {
	const posts = (await getAllPosts()).filter((post) => isPublicPost(post) && Number.isFinite(Date.parse(post.date))).toSorted((a, b) => Date.parse(b.date) - Date.parse(a.date));
	const from = posts.length ? Date.parse(posts[0].date) - (FEED_MAX_DAYS + 1) * 86_400_000 : 0;
	const items: FeedItem[] = posts
		.filter((post) => Date.parse(post.date) >= from)
		.slice(0, MAX_POSTS)
		.map((post) => {
			const block = blockFromPost(post, getPostPermalink(post));
			return { at: new Date(post.date).toISOString(), source: 'post', block: { ...block, ...(block.excerpt ? { excerpt: block.excerpt.slice(0, 300) } : {}) } };
		});
	return Response.json(items);
}
