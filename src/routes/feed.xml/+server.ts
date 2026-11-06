import { getAllPosts } from '$lib/posts';
import { serializeRss } from '$lib/server/feeds';
export const prerender = true;
export async function GET() {
 return new Response(serializeRss(await getAllPosts()), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
