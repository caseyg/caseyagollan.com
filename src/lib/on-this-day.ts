import { TYPE_ICONS } from './posts-filter';
import { getPostPermalink, type Post } from './posts-types';

/** One post as a line in "On this day". */
export interface OnThisDayItem {
	href: string;
	type: Post['type'];
	icon: string;
	text: string;
	/** The post's first photo, as a thumbnail. */
	photo?: { url: string; alt: string };
}

/** The posts from one earlier (or later) year on the same month and day. */
export interface OnThisDayYear {
	year: string;
	/** That day's page. */
	href: string;
	/** Up to `perYear` of that day's posts, oldest first, as they read on the day. */
	items: OnThisDayItem[];
	/** Every post that day, including those left out of `items`. */
	total: number;
}

function plain(markdown: string): string {
	return markdown
		.replace(/<[^>]*>/g, ' ')
		.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[name] ?? '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/^#{1,6}\s+|^>\s?|^[*-]\s+/gm, '')
		.replace(/(\*\*|__|\*|_|`)(.*?)\1/g, '$2')
		.replace(/\s+/g, ' ')
		.trim();
}

function target(post: Post): string | undefined {
	const url = post.bookmarkOf ?? post.inReplyTo ?? post.properties?.['like-of']?.[0] ?? post.properties?.['repost-of']?.[0];
	if (typeof url !== 'string') return;
	try {
		const { host, pathname } = new URL(url);
		return `${host.replace(/^www\./, '')}${pathname === '/' ? '' : pathname}`;
	} catch {
		return url;
	}
}

/** A like or repost by what it points at: the saved copy's author and words, when there is one. */
function snapshot(post: Post): string | undefined {
	const saved = post.socialSnapshots?.[0];
	const words = saved && plain(saved.html);
	return saved && words ? `${saved.author.name || saved.author.handle}: ${words}` : undefined;
}

/** A short line of text that names a post. */
export function postLine(post: Post, max = 140): string {
	const text = post.title || post.summary || plain(post.content) || snapshot(post) || target(post) || `A ${post.type}`;
	return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Posts from the same month and day as `dateKey` (YYYY-MM-DD) in every other year, newest year
 * first. Dates are read as written, in the time zone they were posted in, as the day pages do.
 */
export function onThisDay(posts: Post[], dateKey: string, perYear = 3): OnThisDayYear[] {
	const [year, monthDay] = [dateKey.slice(0, 4), dateKey.slice(4, 10)];
	const byYear = new Map<string, Post[]>();
	for (const post of posts) {
		const postYear = post.date.slice(0, 4);
		if (postYear === year || post.date.slice(4, 10) !== monthDay) continue;
		byYear.set(postYear, [...(byYear.get(postYear) ?? []), post]);
	}
	return [...byYear.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([postYear, list]) => {
			const sorted = list.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
			return {
				year: postYear,
				href: `/${postYear}${monthDay.replace(/-/g, '/')}/`,
				total: sorted.length,
				items: sorted.slice(0, perYear).map((post) => ({
					href: getPostPermalink(post),
					type: post.type,
					icon: TYPE_ICONS[post.type] ?? '📌',
					text: postLine(post),
					photo: post.photo?.[0] ? { url: post.photo[0].url, alt: post.photo[0].alt ?? '' } : undefined
				}))
			};
		});
}
