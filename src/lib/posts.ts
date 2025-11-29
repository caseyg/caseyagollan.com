import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';

export interface Post {
	slug: string;
	type: 'note' | 'article' | 'bookmark' | 'photo' | 'video' | 'reply' | 'media';
	date: string;
	title?: string;
	summary?: string;
	category?: string | string[];
	content: string;
	visibility?: string;
	syndication?: string[];
	filePath: string;
}

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

				const slug = file.replace(/\.md$/, '');

				// Convert date to string if it's a Date object
				const dateStr = data.date instanceof Date
					? data.date.toISOString()
					: (data.date || '');

				posts.push({
					slug,
					type: type.slice(0, -1) as Post['type'], // Remove 's' from plural
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

export function getPostsByDay(posts: Post[]): Map<string, Post[]> {
	const byDay = new Map<string, Post[]>();

	for (const post of posts) {
		const date = new Date(post.date);
		const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

		if (!byDay.has(dateKey)) {
			byDay.set(dateKey, []);
		}
		byDay.get(dateKey)!.push(post);
	}

	return byDay;
}
