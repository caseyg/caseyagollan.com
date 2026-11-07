import type { SocialSnapshot } from './social-snapshots';
// Client-safe post types and constants (no Node.js imports)

export interface MediaItem {
	url: string;
	alt?: string;
	type?: string;
}

export interface Post {
	slug: string;
	type: 'note' | 'article' | 'bookmark' | 'photo' | 'video' | 'reply' | 'media' | 'like' | 'repost' | 'event' | 'review' | 'itinerary' | 'food' | 'drink';
	date: string;
	updated?: string;
	syndicationTargets?: string[];
	title?: string;
	bookmarkOf?: string;
	inReplyTo?: string;
	summary?: string;
	category?: string | string[];
	content: string;
	contentFormat?: 'text' | 'html' | 'markdown';
	postStatus?: string;
	deleted?: boolean;
	visibility?: string;
	draft?: boolean;
	syndication?: string[];
	photo?: MediaItem[];
	video?: MediaItem[];
	microformatType?: string;
	channel?: string;
	socialSnapshots?: SocialSnapshot[];
	properties?: Record<string, unknown[]>;
	indexActivities?: { type: 'like' | 'repost'; date: string; permalink: string }[];
	filePath: string;
}

export const POST_TYPES = ['note', 'article', 'bookmark', 'photo', 'video', 'reply', 'media', 'like', 'repost', 'event', 'review', 'itinerary', 'food', 'drink'] as const;
export const POST_TYPE_PLURALS: Record<string, string> = {
	note: 'notes',
	article: 'articles',
	bookmark: 'bookmarks',
	photo: 'photos',
	video: 'videos',
	reply: 'replies',
	media: 'media',
	like: 'likes',
	repost: 'reposts',
	event: 'events',
	review: 'reviews',
	itinerary: 'itineraries',
	food: 'foods',
	drink: 'drinks'
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

/** Presentation only: retain source records and permalinks, render shared content once. */
export function rollupIndexPosts(posts: Post[]): Post[] {
	const result: Post[] = [];
	const candidates = new Map<string, number>();
	for (const post of posts) {
		const key = post.type === 'like' ? 'like-of' : post.type === 'repost' ? 'repost-of' : '';
		const targets = post.properties?.[key];
		if (!key || targets?.length !== 1 || typeof targets[0] !== 'string') {
			result.push(post);
			continue;
		}
		let target: string;
		try {
			const url = new URL(targets[0]);
			url.hash = '';
			url.pathname = url.pathname.replace(/\/$/, '');
			target = url.href;
		} catch { result.push(post); continue; }
		// Different commentary or media deserves a separate entry.
		const signature = JSON.stringify([target, post.content.trim(), post.title, post.summary, post.photo, post.video]);
		const index = candidates.get(signature);
		const previous = index === undefined ? undefined : result[index];
		if (!previous || previous.type === post.type || previous.indexActivities) {
			candidates.set(signature, result.length);
			result.push(post);
			continue;
		}
		const primary = Date.parse(post.date) > Date.parse(previous.date) ? post : previous;
		const snapshot = [primary, previous, post].flatMap(p => p.socialSnapshots ?? []).find(s => {
			try { const url = new URL(s.url); url.hash = ''; url.pathname = url.pathname.replace(/\/$/, ''); return url.href === target; } catch { return false; }
		});
		result[index!] = {
			...primary,
			properties: { ...primary.properties, 'like-of': [target], 'repost-of': [target] },
			socialSnapshots: snapshot ? [{ ...snapshot, url: target }] : primary.socialSnapshots,
			category: [...new Set([previous.category, post.category].flatMap(c => c ? Array.isArray(c) ? c : [c] : []))],
			indexActivities: [previous, post].map(p => ({type: p.type as 'like' | 'repost', date: p.date, permalink: getPostPermalink(p)})).sort((a,b) => a.type.localeCompare(b.type))
		};
	}
	return result;
}

export function getPostsByDay(posts: Post[]): Map<string, Post[]> {
	const byDay = new Map<string, Post[]>();

	for (const post of rollupIndexPosts(posts)) {
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
