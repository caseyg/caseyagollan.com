import { getAllPosts } from '$lib/posts';
import { createPublicationManifest } from '$lib/server/publishing/publication';
export const prerender = true;
export async function GET() {
 return new Response(JSON.stringify(await createPublicationManifest(await getAllPosts())), {
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
 });
}
