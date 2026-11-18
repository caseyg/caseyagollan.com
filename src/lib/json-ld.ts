// schema.org JSON-LD, generated from the same post data as the microformats.
// Microformats stay the source of truth for IndieWeb tools; this is for search engines and
// link previews, which read schema.org instead.
import { SITE_URL } from './feeds';
import { SITE_IDENTITY } from './identity';
import { SEARCH_QUERY_PARAM } from './opensearch';
import type { Post } from './posts-types';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
type Node = { [key: string]: Json | undefined };
type Properties = Record<string, unknown[]>;

export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
/** The author as posts name it: the @id ties it to the homepage's Person, and name and url make it stand alone. */
const AUTHOR = { '@type': 'Person', '@id': PERSON_ID, name: SITE_IDENTITY.name, url: SITE_IDENTITY.url };

const text = (p: Properties | undefined, key: string): string | undefined => {
	const value = p?.[key]?.[0];
	return typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined;
};
const texts = (p: Properties | undefined, key: string): string[] => (p?.[key] ?? []).filter((value): value is string => typeof value === 'string' && !!value.trim());
const number = (p: Properties | undefined, key: string): number | undefined => {
	const value = Number(p?.[key]?.[0]);
	return p?.[key]?.length && Number.isFinite(value) ? value : undefined;
};
function nested(value: unknown): Properties {
	const p = value && typeof value === 'object' ? (value as { properties?: unknown }).properties : undefined;
	return p && typeof p === 'object' && !Array.isArray(p) ? p as Properties : {};
}
function absolute(url: string | undefined): string | undefined {
	if (!url) return;
	try {
		const parsed = new URL(url, SITE_URL);
		return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined;
	} catch { return; }
}
/** Drop empty values so the output says only what is known. */
function clean(node: Node): Node {
	return Object.fromEntries(Object.entries(node).filter(([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && !value.length)));
}

/** The site's owner, the author of every post: the same identity as the h-card. */
export function personJsonLd(): Node {
	return {
		'@type': 'Person', '@id': PERSON_ID, name: SITE_IDENTITY.name, url: SITE_IDENTITY.url, image: SITE_IDENTITY.photo,
		description: SITE_IDENTITY.note, homeLocation: { '@type': 'Place', name: SITE_IDENTITY.locality },
		sameAs: SITE_IDENTITY.profiles.map(profile => profile.href)
	};
}

/** The homepage: the person and the site, with its search. */
export function homeJsonLd(): Node {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			personJsonLd(),
			{
				'@type': 'WebSite', '@id': WEBSITE_ID, url: `${SITE_URL}/`, name: SITE_IDENTITY.name, publisher: { '@id': PERSON_ID },
				potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/?${SEARCH_QUERY_PARAM}={search_term_string}`, 'query-input': 'required name=search_term_string' }
			}
		]
	};
}

function address(p: Properties): Node | undefined {
	const parts = clean({ '@type': 'PostalAddress', streetAddress: text(p, 'street-address'), addressLocality: text(p, 'locality'), addressRegion: text(p, 'region'), postalCode: text(p, 'postal-code'), addressCountry: text(p, 'country-name') });
	return Object.keys(parts).length > 1 ? parts : undefined;
}
function geo(p: Properties): Node | undefined {
	const latitude = number(p, 'latitude'), longitude = number(p, 'longitude');
	return latitude !== undefined && longitude !== undefined ? { '@type': 'GeoCoordinates', latitude, longitude } : undefined;
}
/** A place from an h-card, a plain name, or a geo: URI. */
function place(value: unknown): Node | undefined {
	if (typeof value === 'string') {
		const coords = value.match(/^geo:([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/);
		if (coords) return { '@type': 'Place', geo: { '@type': 'GeoCoordinates', latitude: Number(coords[1]), longitude: Number(coords[2]) } };
		const url = absolute(value);
		return url ? { '@type': 'Place', url } : { '@type': 'Place', name: value };
	}
	const p = nested(value);
	return clean({ '@type': 'Place', name: text(p, 'name'), url: absolute(text(p, 'url')), address: address(p), geo: geo(p) });
}
/** ISO 8601 durations pass through; anything else is left out. */
const duration = (value: string | undefined) => value && /^P(?!$)(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(value) ? value : undefined;

/**
 * One post as schema.org: a Recipe, Event, Review or Place where the post is one of those,
 * otherwise a BlogPosting (articles) or SocialMediaPosting (everything shorter).
 */
export function postJsonLd(post: Post, options: { url: string; description?: string }): Node {
	const p = post.properties ?? {};
	const url = absolute(options.url)!;
	const images = (post.photo ?? []).map(photo => absolute(photo.url)).filter((value): value is string => !!value);
	const categories = (Array.isArray(post.category) ? post.category : post.category ? [post.category] : []).filter(tag => typeof tag === 'string');
	const common = {
		'@id': `${url}#post`, url, mainEntityOfPage: url, author: AUTHOR,
		datePublished: post.date || undefined, dateModified: post.updated, image: images.length ? images : undefined,
		keywords: categories.length ? categories.join(', ') : undefined, description: options.description || undefined
	};
	let node: Node;
	const type = post.microformatType;
	if (post.type === 'recipe' || type === 'h-recipe') {
		node = { '@type': 'Recipe', ...common, name: post.title ?? text(p, 'name'), recipeIngredient: texts(p, 'ingredient'), recipeYield: text(p, 'yield'), totalTime: duration(text(p, 'duration')), recipeInstructions: options.description };
	} else if (post.type === 'event' || type === 'h-event') {
		node = { '@type': 'Event', ...common, name: post.title ?? text(p, 'name'), startDate: text(p, 'start'), endDate: text(p, 'end'), location: (p.location ?? []).map(place).filter((value): value is Node => !!value)[0], organizer: AUTHOR };
	} else if (post.type === 'review' || type === 'h-review') {
		const item = nested(p.item?.[0]);
		const rating = number(p, 'rating');
		node = {
			'@type': 'Review', ...common, name: post.title ?? text(p, 'name'), reviewBody: options.description,
			itemReviewed: clean({ '@type': 'Thing', name: text(item, 'name'), url: absolute(text(item, 'url')) }),
			reviewRating: rating === undefined ? undefined : clean({ '@type': 'Rating', ratingValue: rating, bestRating: number(p, 'best'), worstRating: number(p, 'worst') })
		};
	} else if (post.type === 'venue' || type === 'h-card') {
		node = { '@type': 'Place', '@id': `${url}#post`, url, mainEntityOfPage: url, name: post.title ?? text(p, 'name'), description: options.description || text(p, 'note'), address: address(p), geo: geo(p), sameAs: absolute(text(p, 'url')), image: common.image };
	} else {
		node = {
			'@type': post.type === 'article' ? 'BlogPosting' : 'SocialMediaPosting', ...common,
			headline: post.title ? post.title.slice(0, 110) : undefined, sharedContent: post.bookmarkOf ? { '@type': 'WebPage', url: absolute(post.bookmarkOf) } : undefined,
			contentLocation: post.type === 'checkin' ? place(p.checkin?.[0]) : undefined
		};
	}
	return { '@context': 'https://schema.org', ...clean(node) };
}

/** A <script> element holding JSON-LD, safe to place in the page head with {@html}. */
export function jsonLdScript(data: Node): string {
	// `<` is escaped so text in a post can never close the script element.
	return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}
