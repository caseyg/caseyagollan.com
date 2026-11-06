import type { PageServerLoad } from './$types';
import { getAllPosts } from '$lib/posts';
import { building } from '$app/environment';
import { getGitHubPost, validPostParams } from '$lib/server/github-posts';
import { error } from '@sveltejs/kit';

// Keep generated posts static, but retain this route in the Worker for new URLs.
export const prerender = 'auto';

export const load: PageServerLoad = async (event) => {
	const { params, fetch, setHeaders } = event;
	const { year, month, day, slug } = params;
	if (!building) setHeaders({ 'cache-control': 'no-store' });
	if (!validPostParams(params)) error(404, 'Not found');

	const dateKey = `${year}-${month}-${day}`;
	let post = (await getAllPosts()).find(p => p.date.startsWith(dateKey) && p.slug === slug);
	if (!post && !building) {
		try {
			post = (await getGitHubPost(params, fetch, event.platform?.env?.GITHUB_CONTENT_TOKEN)) ?? undefined;
		} catch (cause) {
			console.error('Could not load post from GitHub', cause);
			error(503, 'Post temporarily unavailable. Please try again shortly.');
		}
	}

	if (!post) error(404, 'Post not found');
	return { year, month, day, post };
};
