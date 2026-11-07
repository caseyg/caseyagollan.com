// Server-only module - parses the Markdown snapshot bundled by Vite
// For client-safe types and constants, import from '$lib/posts-types'

import { building, dev } from '$app/environment';
import { createPostReader } from './server/build-posts';

import type { Post } from './posts-types';

// Re-export client-safe types and functions
export type { Post, MediaItem } from './posts-types';
export { POST_TYPES, POST_TYPE_PLURALS, getPostPermalink, getPostsByDay, rollupIndexPosts } from './posts-types';

// Vite reads these files at build time; no filesystem APIs run in the Worker.
const markdownFiles = import.meta.glob<string>('/content/*/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

export const getAllPosts = createPostReader(markdownFiles, building && !dev);

export async function getPostBySlug(slug: string): Promise<Post | null> {
	const posts = await getAllPosts();
	return posts.find(p => p.slug === slug) || null;
}


export function getPostsByType(posts: Post[], type: string): Post[] {
	return posts.filter(p => p.type === type);
}

export function getAllTags(posts: Post[]): Map<string, number> {
	const tags = new Map<string, number>();

	for (const post of posts) {
		if (!post.category) continue;

		const categories = Array.isArray(post.category) ? post.category : [post.category];
		for (const cat of categories) {
			tags.set(cat, (tags.get(cat) || 0) + 1);
		}
	}

	return tags;
}

export function getPostsByTag(posts: Post[], tag: string): Post[] {
	const tagLower = tag.toLowerCase();
	return posts.filter(post => {
		if (!post.category) return false;
		const categories = Array.isArray(post.category) ? post.category : [post.category];
		return categories.some(cat => cat.toLowerCase() === tagLower);
	});
}

