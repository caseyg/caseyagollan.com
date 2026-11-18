import { tagFeed, tagFeedEntries } from '$lib/server/scoped-feeds';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;
export const entries: EntryGenerator = tagFeedEntries;
export const GET: RequestHandler = ({ params }) => tagFeed(params.tag, 'atom');
