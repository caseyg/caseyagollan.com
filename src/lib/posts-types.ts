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
	// Extract date components from ISO string directly to preserve local date
	// e.g., "2025-11-29T19:33:16-05:00" -> year=2025, month=11, day=29
	const match = post.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (match) {
		const [, year, month, day] = match;
		return `/${year}/${month}/${day}/${post.slug}/`;
	}
	// Fallback to Date parsing if format doesn't match
	const date = new Date(post.date);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `/${year}/${month}/${day}/${post.slug}/`;
}

export function getPostsByDay(posts: Post[]): Map<string, Post[]> {
	const byDay = new Map<string, Post[]>();

	for (const post of posts) {
		// Extract date from ISO string directly to preserve local date
		const match = post.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
		const dateKey = match ? `${match[1]}-${match[2]}-${match[3]}` : post.date.slice(0, 10);

		if (!byDay.has(dateKey)) {
			byDay.set(dateKey, []);
		}
		byDay.get(dateKey)!.push(post);
	}

	return byDay;
}
