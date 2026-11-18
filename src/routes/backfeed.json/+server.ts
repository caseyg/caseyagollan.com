import { getAllPosts } from '$lib/posts';
import { getPostPermalink } from '$lib/posts-types';
import { isPublicPost } from '$lib/server/parse-post';
import { socialCopy, type BackfeedTarget } from '$lib/server/backfeed';

export const prerender = true;

/**
 * Posts with their own copies on Mastodon or Bluesky, for the cron that reads their replies,
 * favorites and reposts (`$lib/server/backfeed`). Likes and reposts are left out: their
 * syndication points at someone else's post.
 */
export async function GET() {
	const posts: BackfeedTarget[] = [];
	for (const post of await getAllPosts()) {
		if (!isPublicPost(post) || post.type === 'like' || post.type === 'repost') continue;
		const syndication = (post.syndication ?? []).filter((url) => socialCopy(url));
		if (syndication.length) posts.push({ path: getPostPermalink(post), published: post.date, syndication });
	}
	return new Response(JSON.stringify({ version: 1, posts }), {
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
	});
}
