import { openSearchDescription } from '$lib/opensearch';
export const prerender = true;
export function GET() {
	return new Response(openSearchDescription(), { headers: { 'Content-Type': 'application/opensearchdescription+xml; charset=utf-8' } });
}
