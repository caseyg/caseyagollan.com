// Client-safe helpers for the post type filters on the main feed.
import { POST_TYPES, POST_TYPE_PLURALS, type Post } from './posts-types';

export type PostType = Post['type'];

/** Feed entries per prerendered data chunk read by the filtered feed. */
export const FEED_CHUNK_SIZE = 10;
export const FILTER_PATH = '/posts/filter';

export interface TypeFilterOption {
	type: PostType;
	label: string;
	icon: string;
	count: number;
}

/** Shared with the type archive pages so each type keeps one emoji everywhere. */
export const TYPE_ICONS: Record<PostType, string> = {
	note: '📝',
	article: '📄',
	bookmark: '🔖',
	photo: '📷',
	video: '🎬',
	reply: '💬',
	media: '🎵',
	like: '♥',
	repost: '🔁',
	event: '📅',
	review: '⭐',
	itinerary: '✈',
	food: '🍽',
	drink: '☕'
};

/** Every type a feed entry stands for: rolled-up reactions and threads carry their members' types. */
export function entryTypes(post: Post): PostType[] {
	const types = new Set<PostType>([post.type]);
	for (const activity of post.indexActivities ?? []) types.add(activity.type);
	for (const member of post.indexThreadPosts ?? []) types.add(member.type);
	return POST_TYPES.filter((type) => types.has(type));
}

/** Pill options in the site's type order, omitting types with no posts. */
export function typeFilterOptions(entries: PostType[][]): TypeFilterOption[] {
	const counts = new Map<PostType, number>();
	for (const types of entries) for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);
	return POST_TYPES.filter((type) => counts.has(type)).map((type) => ({
		type,
		label: POST_TYPE_PLURALS[type].charAt(0).toUpperCase() + POST_TYPE_PLURALS[type].slice(1),
		icon: TYPE_ICONS[type],
		count: counts.get(type)!
	}));
}

/** Read `?types=notes,replies` (plural or singular names). Unknown names are ignored. */
export function parseTypesParam(value: string | null, available: readonly PostType[]): Set<PostType> {
	const selected = new Set<PostType>();
	for (const name of (value ?? '').toLowerCase().split(/[\s,+]+/)) {
		const type = available.find((t) => t === name || POST_TYPE_PLURALS[t] === name);
		if (type) selected.add(type);
	}
	return selected;
}

/** The canonical URL for a selection: the static feed when everything is shown. */
export function typesHref(selected: Iterable<PostType>, available: readonly PostType[], page = 1): string {
	const chosen = new Set(selected);
	const types = available.filter((type) => chosen.has(type));
	if (types.length === 0 || types.length === available.length) return page > 1 ? `/posts/page/${page}` : '/posts';
	const params = new URLSearchParams({ types: types.map((type) => POST_TYPE_PLURALS[type]).join(',') });
	if (page > 1) params.set('page', String(page));
	// Commas read better in a shared link than %2C.
	return `${FILTER_PATH}?${params.toString().replaceAll('%2C', ',')}`;
}

/** For archive pages that list every post at once: filter in place with `?types=`. */
export function localTypesHref(pathname: string, selected: Iterable<PostType>, available: readonly PostType[]): string {
	const chosen = new Set(selected);
	const types = available.filter((type) => chosen.has(type));
	if (types.length === 0 || types.length === available.length) return pathname;
	return `${pathname}?types=${types.map((type) => POST_TYPE_PLURALS[type]).join(',')}`;
}

/**
 * Pills start unselected, meaning everything is shown. Clicking one narrows the feed to that type;
 * further clicks add or remove types, and removing the last type shows everything again.
 */
export function toggleTypes(type: PostType, selected: ReadonlySet<PostType>, available: readonly PostType[]): PostType[] {
	if (available.every((t) => selected.has(t))) return [type];
	const next = new Set(selected);
	if (next.has(type)) next.delete(type);
	else next.add(type);
	return next.size ? available.filter((t) => next.has(t)) : [...available];
}
