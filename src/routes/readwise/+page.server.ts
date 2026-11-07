import { redirect } from '@sveltejs/kit';
import { readwiseSession } from '$lib/server/readwise-auth';
import { privateHeaders } from '$lib/server/readwise';
import { getAllPosts, getAllTags } from '$lib/posts';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ request, platform, setHeaders }) => {
 setHeaders(privateHeaders);
 const session = await readwiseSession(request, platform?.env);
 if (!session) redirect(303, '/account?returnTo=%2Freadwise');
 return { csrf: session.csrf, tags: [...getAllTags(await getAllPosts()).keys()].sort((a, b) => a.localeCompare(b)) };
};
