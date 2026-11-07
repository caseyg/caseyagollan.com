import { getAllPosts } from '$lib/posts';
import { serializeJsonFeed } from '$lib/server/feeds';
export const prerender = true;
export async function GET() {
 return new Response(serializeJsonFeed(await getAllPosts()), { headers: { 'Content-Type': 'application/feed+json; charset=utf-8' } });
}
