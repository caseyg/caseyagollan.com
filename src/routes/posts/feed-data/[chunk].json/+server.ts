import { error } from '@sveltejs/kit';
import { feedChunk, feedChunkCount, getFeedEntries } from '$lib/server/posts-feed';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = async () =>
	Array.from({ length: feedChunkCount(await getFeedEntries()) }, (_, chunk) => ({ chunk: String(chunk) }));

/** Consecutive feed entries, read by the filtered feed for just the entries on its page. */
export const GET: RequestHandler = async ({ params }) => {
	const entries = await getFeedEntries();
	const chunk = Number(params.chunk);
	if (!/^\d+$/.test(params.chunk) || chunk >= feedChunkCount(entries)) error(404, 'Not found');
	return Response.json(feedChunk(entries, chunk));
};
