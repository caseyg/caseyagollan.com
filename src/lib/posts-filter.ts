// Client-safe helpers for the facets of the Posts menu: post type, tag and year.
import type { MenuOption } from './components/ui/SelectMenu.svelte';
import { POST_TYPES, POST_TYPE_PLURALS, type Post } from './posts-types';

export type PostType = Post['type'];

/** Feed entries per prerendered data chunk read by the filtered feed. */
export const FEED_CHUNK_SIZE = 10;
export const FILTER_PATH = '/posts/filter';

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

/** What the facets need to know about one feed entry. Tags are lower case. */
export interface FacetEntry {
	types: PostType[];
	tags: string[];
	year: string;
}

/** The choices in effect. Within a facet any choice may match; across facets all must. */
export interface Facets {
	types: PostType[];
	tags: string[];
	years: string[];
}

/** Tags shown in the menu before it hands over to the page of all tags. */
const MENU_TAGS = 6;

export function postTags(post: Post): string[] {
	return post.category ? (Array.isArray(post.category) ? post.category : [post.category]) : [];
}

export function entryFacets(post: Post): FacetEntry {
	return { types: entryTypes(post), tags: [...new Set(postTags(post).map((tag) => tag.toLowerCase()))], year: post.date.slice(0, 4) };
}

/** In a fixed order with no repeats, so every selection has one URL. */
export function normalizeFacets(facets: Partial<Facets>): Facets {
	const types = new Set(facets.types);
	return {
		types: POST_TYPES.filter((type) => types.has(type)),
		tags: [...new Set((facets.tags ?? []).map((tag) => tag.toLowerCase()))].sort(),
		years: [...new Set(facets.years)].sort().reverse()
	};
}

const names = (value: string | null) => (value ?? '').split(',').map((name) => name.trim()).filter(Boolean);

/** Read `?types=notes,replies&tags=indieweb&years=2026`. Type names may be plural or singular; unknown ones are ignored. */
export function parseFacets(params: URLSearchParams): Facets {
	const types = names(params.get('types')?.replaceAll('+', ',').replaceAll(' ', ',') ?? null)
		.map((name) => POST_TYPES.find((type) => type === name.toLowerCase() || POST_TYPE_PLURALS[type] === name.toLowerCase()))
		.filter((type): type is PostType => Boolean(type));
	return normalizeFacets({ types, tags: names(params.get('tags')), years: names(params.get('years')).filter((year) => /^\d{4}$/.test(year)) });
}

export function hasFacets(facets: Facets): boolean {
	return facets.types.length + facets.tags.length + facets.years.length > 0;
}

/**
 * The one URL for a selection. Nothing chosen is the static feed, and a single year or tag on its own
 * is that year's or tag's page; everything else is the filtered feed.
 */
export function facetsHref(selection: Partial<Facets>, page = 1): string {
	const facets = normalizeFacets(selection);
	if (!hasFacets(facets)) return page > 1 ? `/posts/page/${page}` : '/posts';
	if (page === 1 && !facets.types.length) {
		if (facets.years.length === 1 && !facets.tags.length) return `/${facets.years[0]}/`;
		if (facets.tags.length === 1 && !facets.years.length) return `/tags/${encodeURIComponent(facets.tags[0])}/`;
	}
	const params = new URLSearchParams();
	if (facets.types.length) params.set('types', facets.types.map((type) => POST_TYPE_PLURALS[type]).join(','));
	if (facets.tags.length) params.set('tags', facets.tags.join(','));
	if (facets.years.length) params.set('years', facets.years.join(','));
	if (page > 1) params.set('page', String(page));
	// Commas read better in a shared link than %2C.
	return `${FILTER_PATH}?${params.toString().replaceAll('%2C', ',')}`;
}

/** Whether an entry is shown. `skip` leaves one facet out, to count what its other choices would add. */
export function matchesFacets(entry: FacetEntry, facets: Facets, skip?: keyof Facets): boolean {
	return (
		(skip === 'types' || !facets.types.length || entry.types.some((type) => facets.types.includes(type))) &&
		(skip === 'tags' || !facets.tags.length || entry.tags.some((tag) => facets.tags.includes(tag))) &&
		(skip === 'years' || !facets.years.length || facets.years.includes(entry.year))
	);
}

const toggled = <T>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
const typeLabel = (type: PostType) => POST_TYPE_PLURALS[type].charAt(0).toUpperCase() + POST_TYPE_PLURALS[type].slice(1);

/** What is chosen, in words: "Notes", "#indieweb", "2026". */
export function facetLabels(selection: Partial<Facets>, tagNames: Record<string, string> = {}): string[] {
	const facets = normalizeFacets(selection);
	return [...facets.types.map(typeLabel), ...facets.tags.map((tag) => `#${tagNames[tag] ?? tag}`), ...facets.years];
}

/**
 * The Posts menu: the feed, then post types, tags and years as check boxes that combine.
 * Each count is the number of posts the choice would show given the other facets, and a choice
 * that would show none is left out, so no combination leads to an empty page.
 */
export function facetMenu(entries: FacetEntry[], tagNames: Record<string, string>, selection: Partial<Facets> = {}): MenuOption[] {
	const facets = normalizeFacets(selection);
	const types = new Map<PostType, number>();
	const tags = new Map<string, number>();
	const years = new Map<string, number>();
	const add = <K>(counts: Map<K, number>, key: K) => counts.set(key, (counts.get(key) ?? 0) + 1);
	for (const entry of entries) {
		if (matchesFacets(entry, facets, 'types')) for (const type of entry.types) add(types, type);
		if (matchesFacets(entry, facets, 'tags')) for (const tag of entry.tags) add(tags, tag);
		if (matchesFacets(entry, facets, 'years')) add(years, entry.year);
	}

	const typeOptions: MenuOption[] = POST_TYPES.filter((type) => types.has(type) || facets.types.includes(type)).map((type) => ({
		value: type,
		label: typeLabel(type),
		icon: TYPE_ICONS[type],
		count: types.get(type) ?? 0,
		href: facetsHref({ ...facets, types: toggled(facets.types, type) }),
		checked: facets.types.includes(type),
		group: 'Type'
	}));

	// The most used tags that still match, with any chosen tag kept in view.
	const ranked = [...new Set([...facets.tags, ...tags.keys()])].sort((a, b) => (tags.get(b) ?? 0) - (tags.get(a) ?? 0) || a.localeCompare(b));
	const shownTags = ranked.filter((tag, i) => i < MENU_TAGS || facets.tags.includes(tag));
	const tagOptions: MenuOption[] = shownTags.map((tag) => ({
		value: `tag:${tag}`,
		label: `#${tagNames[tag] ?? tag}`,
		count: tags.get(tag) ?? 0,
		href: facetsHref({ ...facets, tags: toggled(facets.tags, tag) }),
		checked: facets.tags.includes(tag),
		group: 'Tag'
	}));
	if (Object.keys(tagNames).length) tagOptions.push({ value: 'tags', label: 'All tags', href: '/tags/', icon: '🏷️', group: 'Tag' });

	const yearOptions: MenuOption[] = [...new Set([...facets.years, ...years.keys()])].sort().reverse().map((year) => ({
		value: year,
		label: year,
		count: years.get(year) ?? 0,
		href: facetsHref({ ...facets, years: toggled(facets.years, year) }),
		checked: facets.years.includes(year),
		group: 'Year'
	}));

	return [{ value: 'all', label: 'All posts', href: '/posts/', icon: '📡' }, ...typeOptions, ...tagOptions, ...yearOptions];
}
