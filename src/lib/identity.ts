/**
 * Who the site belongs to, listed once. The representative h-card on the homepage,
 * the author h-card on every post, the `rel=me` head links and social cards all read it,
 * so a new profile only needs adding here.
 */

export interface SiteProfile {
	/** Shown as the link text. */
	label: string;
	/** Linked with `rel=me`; it verifies where the profile links back to the site. */
	href: string;
}

export interface SiteIdentity {
	name: string;
	/** The canonical homepage: the h-card's `u-url` and `u-uid`. */
	url: string;
	/** Absolute, so parsers reading any page find the same photo. */
	photo: string;
	note: string;
	locality: string;
	profiles: SiteProfile[];
}

export const SITE_IDENTITY: SiteIdentity = {
	name: 'Casey Gollan',
	url: 'https://caseyagollan.com/',
	photo: 'https://caseyagollan.com/author-avatar.webp',
	note: 'Senior Manager of Engineering at IBM, building AI productivity platforms. Previously co-founded the School for Poetic Computation.',
	locality: 'New York City',
	profiles: [
		{ label: 'Mastodon', href: 'https://social.coop/@caseyg' },
		{ label: 'Bluesky', href: 'https://bsky.app/profile/caseyagollan.com' },
		{ label: 'GitHub', href: 'https://github.com/caseyg' },
		{ label: 'Wiki', href: 'https://cag.wiki/' }
	]
};
