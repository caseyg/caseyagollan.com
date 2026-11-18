import { typeFeed, typeFeedEntries } from '$lib/server/scoped-feeds';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;
export const entries: EntryGenerator = typeFeedEntries;
export const GET: RequestHandler = ({ params }) => typeFeed(params.type, 'rss');
