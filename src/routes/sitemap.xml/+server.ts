import { getAllPosts } from '$lib/posts';
import { serializeSitemap } from '$lib/server/sitemap';
export const prerender = true;
export async function GET() {
	return new Response(serializeSitemap(await getAllPosts()), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
