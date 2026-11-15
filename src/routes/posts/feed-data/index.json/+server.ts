import { buildFeedIndex, getFeedEntries } from '$lib/server/posts-feed';

export const prerender = true;

/** Types, tags and year of every feed entry, so the filtered feed can paginate and count without parsing posts. */
export async function GET() {
	return Response.json(buildFeedIndex(await getFeedEntries()));
}
