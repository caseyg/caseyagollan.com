import { getPostsMenu } from '$lib/server/posts-menu';
import { buildFeedIndex, getFeedEntries } from '$lib/server/posts-feed';

export const prerender = true;

/** Types of every feed entry, so the filtered feed can paginate without parsing posts. */
export async function GET() {
	return Response.json(buildFeedIndex(await getFeedEntries(), await getPostsMenu()));
}
