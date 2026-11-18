import type { IconName } from '$lib/components/ui';

export interface SiteFeed {
	/** Path on the site, so preview deployments link their own feeds. */
	path: string;
	label: string;
	mime: string;
	icon: IconName;
}

/** The three formats every feed comes in, by file name. */
const FORMATS: (Omit<SiteFeed, 'path'> & { file: string })[] = [
	{ file: 'feed.xml', label: 'RSS', mime: 'application/rss+xml', icon: 'rss' },
	{ file: 'atom.xml', label: 'Atom', mime: 'application/atom+xml', icon: 'atom' },
	{ file: 'feed.json', label: 'JSON Feed', mime: 'application/feed+json', icon: 'braces' }
];

/** A page's own feeds, which the root layout lists before the site's: `data.feeds` in its load. */
export interface ScopedFeeds {
	/** What they hold, as a reader names them: "Photos", "#indieweb". */
	title: string;
	feeds: SiteFeed[];
}

/** One feed in each format under `base`, a site path ending in a slash. */
export function feedsAt(base: string): SiteFeed[] {
	return FORMATS.map(({ file, ...feed }) => ({ ...feed, path: `${base}${file}` }));
}

/** The site's feeds of recent posts, in the order readers are offered them. */
export const SITE_FEEDS: SiteFeed[] = feedsAt('/');

/** Where a post type's page and feeds live: `/type/photos/`. */
export function typeFeedBase(plural: string): string {
	return `/type/${encodeURIComponent(plural)}/`;
}

/** Where a tag's page and feeds live: `/tags/indieweb/`. Tags are matched without case. */
export function tagFeedBase(tag: string): string {
	return `/tags/${encodeURIComponent(tag.toLowerCase())}/`;
}

/** Feeds of one post type, named by its plural ("photos"). */
export function typeFeeds(plural: string): SiteFeed[] {
	return feedsAt(typeFeedBase(plural));
}

/** Feeds of posts with one tag. */
export function tagFeeds(tag: string): SiteFeed[] {
	return feedsAt(tagFeedBase(tag));
}

export const SITE_URL = 'https://caseyagollan.com';
