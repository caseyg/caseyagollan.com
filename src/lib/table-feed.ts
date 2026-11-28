/**
 * The Add menu's feed of what was posted and saved lately, for a weekly roundup: the site's posts
 * and Casey's Are.na, Raindrop and Readwise as one list, newest first, a group for each day.
 * Shared by the menu, the routes that serve it and their tests.
 */
import type { Block } from './tables';

export type FeedSource = 'post' | 'arena' | 'raindrop' | 'readwise';

/** One thing in the feed: the block it would be on a table, and when it was posted or saved. */
export interface FeedItem {
	block: Block;
	/** ISO time. */
	at: string;
	source: FeedSource;
}

export const FEED_SOURCES: { value: FeedSource; label: string; icon: string }[] = [
	{ value: 'post', label: 'Posts', icon: '📡' },
	{ value: 'arena', label: 'Are.na', icon: '✳️' },
	{ value: 'raindrop', label: 'Raindrop', icon: '💧' },
	{ value: 'readwise', label: 'Readwise', icon: '📖' }
];

export const isFeedSource = (value: unknown): value is FeedSource => FEED_SOURCES.some((source) => source.value === value);

/** How far back the feed goes, in days. */
export const FEED_RANGES = [
	{ value: '7', label: 'Past week' },
	{ value: '14', label: '2 weeks' },
	{ value: '30', label: 'Month' }
] as const;
export type FeedRange = (typeof FEED_RANGES)[number]['value'];
/** The longest range: the posts list is cut to it. */
export const FEED_MAX_DAYS = 30;

const DAY = 86_400_000;

/** A calendar day in a time zone (the reader's own unless given), as YYYY-MM-DD. */
export function localDay(at: Date | string, timeZone?: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
	const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The start of the range: `days` ago, to the start of that day where the reader is, so every group is a whole day. */
export function rangeStart(days: number, now = new Date(), timeZone?: string): Date {
	const from = new Date(now.getTime() - days * DAY);
	// Walk back to the first moment still on that day: at most a day and a bit, across a clock change.
	const day = localDay(from, timeZone);
	let low = from.getTime() - 26 * 3_600_000, high = from.getTime();
	while (high - low > 1000) {
		const middle = Math.floor((low + high) / 2);
		if (localDay(new Date(middle), timeZone) === day) high = middle;
		else low = middle;
	}
	return new Date(high);
}

export interface FeedDay {
	/** YYYY-MM-DD where the reader is. */
	day: string;
	/** Today, Yesterday, or the weekday and date. */
	label: string;
	items: FeedItem[];
}

const sameItem = (item: FeedItem) => (item.block.image ? `${item.block.url} ${item.block.image}` : item.block.url);

/** The feed in order: newest first, the same thing listed once. */
export function sortFeed(items: FeedItem[]): FeedItem[] {
	const seen = new Set<string>();
	return items
		.filter((item) => Number.isFinite(Date.parse(item.at)))
		.toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
		.filter((item) => !seen.has(sameItem(item)) && !!seen.add(sameItem(item)));
}

/** A group for each day that has something, newest day first, each day's things newest first. */
export function groupByDay(items: FeedItem[], now = new Date(), timeZone?: string): FeedDay[] {
	const today = localDay(now, timeZone), yesterday = localDay(new Date(now.getTime() - DAY), timeZone);
	const named = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' });
	const days: FeedDay[] = [];
	for (const item of sortFeed(items)) {
		const day = localDay(item.at, timeZone);
		let group = days[days.length - 1];
		if (group?.day !== day) {
			group = { day, label: day === today ? 'Today' : day === yesterday ? 'Yesterday' : named.format(new Date(item.at)), items: [] };
			days.push(group);
		}
		group.items.push(item);
	}
	return days;
}

/** The time of day something was posted or saved, as the reader's clock says it. */
export function timeLabel(at: string, timeZone?: string): string {
	return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(at)).replace(/\s/g, ' ').toLowerCase();
}

/** A block that is a picture before it is anything else: likeness for it goes by how it looks. */
export const isPicture = (block: Pick<Block, 'kind' | 'icon' | 'image'>) => !!block.image && (block.kind === 'image' || block.icon === '🖼️' || block.icon === '📷');

type Fetcher = typeof fetch;

/** Where the site's latest posts are listed as blocks, written at build time. */
export const RECENT_POSTS_PATH = '/posts/feed-data/recent.json';

let posts: Promise<FeedItem[]> | undefined;

/** The site's posts of the last month, read once per page; none when the list can't be had. */
export function recentPosts(fetcher: Fetcher = fetch): Promise<FeedItem[]> {
	posts ??= fetcher(RECENT_POSTS_PATH)
		.then((response) => (response.ok ? (response.json() as Promise<FeedItem[]>) : []))
		.catch(() => []);
	return posts;
}

const SAVES_PAGE = 100;
/** As many saves as the feed reads for one range. */
export const SAVES_MAX = 500;

/**
 * What Casey saved to Are.na, Raindrop and Readwise since a time, from the site's own copy
 * (`/api/sources`), for the signed-in owner. Anyone else, or any failure, gets none.
 */
export async function recentSaves(since: Date, fetcher: Fetcher = fetch): Promise<FeedItem[]> {
	const items: FeedItem[] = [];
	try {
		for (let offset = 0; offset < SAVES_MAX; offset += SAVES_PAGE) {
			const response = await fetcher(`/api/sources?since=${encodeURIComponent(since.toISOString())}&limit=${SAVES_PAGE}&offset=${offset}`, { credentials: 'same-origin' });
			if (!response.ok) break;
			const page = (await response.json()) as { total?: number; items?: FeedItem[] };
			items.push(...(page.items ?? []));
			if (!page.items?.length || items.length >= (page.total ?? 0)) break;
		}
	} catch {
		// What was read so far still shows.
	}
	return items;
}

/** The feed since a time: the site's posts, and for the owner (`saves`) what they saved elsewhere. */
export function recentFeed({ saves = false, fetcher = fetch as Fetcher }: { saves?: boolean; fetcher?: Fetcher } = {}) {
	return async (since: Date): Promise<FeedItem[]> => {
		const [own, saved] = await Promise.all([recentPosts(fetcher), saves ? recentSaves(since, fetcher) : Promise.resolve([])]);
		return sortFeed([...own.filter((item) => Date.parse(item.at) >= since.getTime()), ...saved]);
	};
}

/**
 * Saved things like a block, by the vectors the site's copy keeps (`/api/sources?like=`), for the
 * signed-in owner: a picture finds what looks like it, anything else what reads like it.
 */
export async function similarBlocks(block: Block, limit = 24, fetcher: Fetcher = fetch, origin = globalThis.location?.origin): Promise<Block[]> {
	const params = new URLSearchParams({ like: block.url.startsWith('/') && origin ? new URL(block.url, origin).href : block.url, limit: String(limit) });
	const words = [block.title, block.excerpt].filter(Boolean).join('. ').slice(0, 500);
	if (words) params.set('words', words);
	if (isPicture(block)) params.set('picture', block.image!.startsWith('/') && origin ? new URL(block.image!, origin).href : block.image!);
	try {
		const response = await fetcher(`/api/sources?${params}`, { credentials: 'same-origin' });
		if (!response.ok) return [];
		return ((await response.json()) as { blocks?: Block[] }).blocks ?? [];
	} catch {
		return [];
	}
}
