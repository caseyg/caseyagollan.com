import { getAllPosts } from '$lib/posts';
import { serializeAtom } from '$lib/server/feeds';
export const prerender = true;
export async function GET() {
 return new Response(serializeAtom(await getAllPosts()), { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
}
