import type { RequestHandler } from './$types';
import { PUBLICATION_URI } from '$lib/standard-site';

// Standard.site verification: the domain names the publication record that claims it.
export const prerender = true;
export const GET: RequestHandler = () => new Response(PUBLICATION_URI, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
