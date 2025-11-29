// Server-only module - contains file system operations
// For client-safe types and constants, import from '$lib/posts-types'

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';

// Re-export client-safe types and functions
export type { Post } from './posts-types';
export { POST_TYPES, POST_TYPE_PLURALS, getPostPermalink, getPostsByDay } from './posts-types';

// Mapping from plural folder names to singular type names
const PLURAL_TO_SINGULAR: Record<string, string> = {
	notes: 'note',
	articles: 'article',
	bookmarks: 'bookmark',
	photos: 'photo',
	videos: 'video',
	replies: 'reply',
	media: 'media'
};

import type { Post } from './posts-types';

export async function getAllPosts(): Promise<Post[]> {
	const contentDir = join(process.cwd(), 'content');
	const postTypes = ['notes', 'articles', 'bookmarks', 'photos', 'videos', 'replies', 'media'];
	const posts: Post[] = [];

	for (const type of postTypes) {
		try {
			const typeDir = join(contentDir, type);
			const files = await readdir(typeDir);

			for (const file of files) {
				if (!file.endsWith('.md')) continue;

				const filePath = join(typeDir, file);
				const fileContent = await readFile(filePath, 'utf-8');
				const { data, content } = matter(fileContent);

				// Remove .md extension and strip date prefix (YYYY-MM-DD-) from slug
			const slug = file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');

				// Convert date to string if it's a Date object
				const dateStr = data.date instanceof Date
					? data.date.toISOString()
					: (data.date || '');

				posts.push({
					slug,
					type: PLURAL_TO_SINGULAR[type] as Post['type'],
					date: dateStr,
					title: data.title,
					summary: data.summary,
					category: data.category,
					content,
					visibility: data.visibility,
					syndication: data.syndication,
					filePath: `${type}/${file}`
				});
			}
		} catch (error) {
			// Directory doesn't exist or is empty, skip
			console.warn(`Could not read ${type} directory:`, error);
		}
	}

	// Sort by date, newest first
	return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

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

