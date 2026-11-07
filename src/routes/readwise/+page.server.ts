import { redirect } from '@sveltejs/kit';
import { readwiseSession } from '$lib/server/readwise-auth';
import { privateHeaders } from '$lib/server/readwise';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ request, platform, setHeaders }) => {
 setHeaders(privateHeaders);
 const session = await readwiseSession(request, platform?.env);
 if (!session) redirect(303, '/account?returnTo=%2Freadwise');
 return { csrf: session.csrf };
};
