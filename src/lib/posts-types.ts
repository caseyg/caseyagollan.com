// Client-safe post types and constants (no Node.js imports)

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

export const POST_TYPES = ['note', 'article', 'bookmark', 'photo', 'video', 'reply', 'media'] as const;
export const POST_TYPE_PLURALS: Record<string, string> = {
	note: 'notes',
	article: 'articles',
	bookmark: 'bookmarks',
	photo: 'photos',
	video: 'videos',
	reply: 'replies',
	media: 'media'
};

export function getPostPermalink(post: { date: string; slug: string }): string {
	const date = new Date(post.date);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `/${year}/${month}/${day}/${post.slug}/`;
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
