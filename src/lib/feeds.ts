import type { IconName } from '$lib/components/ui';

export interface SiteFeed {
	/** Path on the site, so preview deployments link their own feeds. */
	path: string;
	label: string;
	mime: string;
	icon: IconName;
}

/** The site's feeds of recent posts, in the order readers are offered them. */
export const SITE_FEEDS: SiteFeed[] = [
	{ path: '/feed.xml', label: 'RSS', mime: 'application/rss+xml', icon: 'rss' },
	{ path: '/atom.xml', label: 'Atom', mime: 'application/atom+xml', icon: 'atom' },
	{ path: '/feed.json', label: 'JSON Feed', mime: 'application/feed+json', icon: 'braces' }
];

export const SITE_URL = 'https://caseyagollan.com';

/**
 * The WebSub hub the feeds name (rel="hub"). Readers that subscribe through it get new posts
 * pushed to them, and the Worker's cron tells it when a deployed feed changes ($lib/server/websub).
 */
export const WEBSUB_HUB = 'https://pubsubhubbub.appspot.com/';
