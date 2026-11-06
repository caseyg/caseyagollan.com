import { parsePost, PLURAL_TO_SINGULAR, isPublicPost } from './parse-post';
import type { Post } from '../posts-types';

/** Reuse parsing during prerendering, while allowing fresh reads in development. */
export function createPostReader(markdownFiles: Record<string, string>, cache: boolean) {
	let cached: Post[] | undefined;
	return async (): Promise<Post[]> => {
		if (cached) return cached;
		const posts: Post[] = [];
		for (const [path, markdown] of Object.entries(markdownFiles)) {
			const [, , type, file] = path.split('/');
			if (!Object.hasOwn(PLURAL_TO_SINGULAR, type)) continue;
			const post = parsePost(markdown, type, file);
			// Indexes and prerender discovery share this list. Draft URLs use the GitHub fallback.
			if (!post.draft && isPublicPost(post)) posts.push(post);
		}
		posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
		if (cache) cached = posts;
		return posts;
	};
}
