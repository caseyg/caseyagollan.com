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
 * One thing selected on a table, to find the like of: a block, the words of a sticky, text box,
 * shape or area, or a picture set down from this device.
 */
export interface LikeThing {
	block?: Block;
	words?: string;
	/** A picture's address, for a picture that isn't a block. */
	picture?: string;
}

/** One thing as the server is asked about it (`/api/sources/alike`). */
export interface LikeSeed {
	/** A block's address, which may be a document in the site's copy. */
	url?: string;
	/** Its words: a sticky's text, or a block's title and excerpt. */
	words?: string;
	/** Its picture's address, when it is a picture before anything else. */
	picture?: string;
}

/** As many things as one question compares against, and as many characters of each one's words. */
export const LIKE_SEEDS_MAX = 12;
export const LIKE_WORDS_MAX = 2000;

/** What tells one selected thing from another. */
export const likeKey = (thing: LikeThing) => (thing.block ? `block ${thing.block.url} ${thing.block.image ?? ''} ${thing.block.excerpt ?? ''}` : thing.picture ? `picture ${thing.picture}` : `words ${thing.words ?? ''}`);
/** A short name for a selected thing: a block's title, or a sticky's first words. */
export function likeTitle(thing: LikeThing): string {
	const words = (thing.block ? thing.block.title || thing.block.excerpt || '' : thing.words ?? '').replace(/\s+/g, ' ').trim();
	return words.length > 60 ? `${words.slice(0, 59).trimEnd()}…` : words || (thing.picture || (thing.block && isPicture(thing.block)) ? 'this picture' : 'this');
}
/** Whether likeness for a thing goes by how it looks. */
export const likeLooks = (thing: LikeThing) => (thing.block ? isPicture(thing.block) : !!thing.picture);

/** Selected things as the server is asked about them, with addresses made whole. */
export function likeSeeds(things: LikeThing[], origin = globalThis.location?.origin): LikeSeed[] {
	const whole = (address: string) => (address.startsWith('/') && origin ? new URL(address, origin).href : address);
	const seen = new Set<string>();
	return things
		.filter((thing) => !seen.has(likeKey(thing)) && !!seen.add(likeKey(thing)))
		.map((thing): LikeSeed => {
			if (thing.block) {
				const words = [thing.block.title, thing.block.excerpt].filter(Boolean).join('. ').slice(0, LIKE_WORDS_MAX);
				return { url: whole(thing.block.url), ...(words ? { words } : {}), ...(isPicture(thing.block) ? { picture: whole(thing.block.image!) } : {}) };
			}
			const words = thing.words?.trim().slice(0, LIKE_WORDS_MAX);
			return { ...(words ? { words } : {}), ...(thing.picture ? { picture: whole(thing.picture) } : {}) };
		})
		.filter((seed) => seed.url || seed.words || seed.picture)
		.slice(0, LIKE_SEEDS_MAX);
}

/**
 * Saved things like what is selected on a table, by the vectors the site's copy keeps
 * (`/api/sources/alike`), for the signed-in owner: a picture finds what looks like it and what
 * reads like the words in it, anything else what reads like it. With several things selected,
 * what is near more of them comes first.
 */
export async function similarBlocks(things: LikeThing[], limit = 24, fetcher: Fetcher = fetch, origin = globalThis.location?.origin): Promise<Block[]> {
	const seeds = likeSeeds(things, origin);
	if (!seeds.length) return [];
	try {
		const response = await fetcher('/api/sources/alike', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seeds, limit }) });
		if (!response.ok) return [];
		return ((await response.json()) as { blocks?: Block[] }).blocks ?? [];
	} catch {
		return [];
	}
}
