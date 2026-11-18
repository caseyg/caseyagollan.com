// Client-safe: person tags are `category` values that name a person rather than a topic.

/** Someone a post tags, published as a `u-category h-card`. */
export interface PersonTag {
	name: string;
	url: string;
	photo?: string;
}

const web = (value: unknown): value is string => {
	if (typeof value !== 'string') return false;
	try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};
const first = (value: unknown) => Array.isArray(value) ? value[0] : value;
const text = (value: unknown) => typeof first(value) === 'string' ? (first(value) as string).trim() : '';

/** A short readable label for a bare profile URL, such as `social.coop/@caseyg`. */
function urlLabel(url: string): string {
	const parsed = new URL(url);
	const path = parsed.pathname.replace(/\/+$/, '');
	return `${parsed.hostname.replace(/^www\./, '')}${path}`;
}

/**
 * Reads one category value as a person: an mf2 h-card object, or a bare profile URL
 * (the Micropub person-tag form). Plain words are topic tags, so they return undefined.
 */
export function personTag(value: unknown): PersonTag | undefined {
	if (web(value)) return { name: urlLabel(value), url: value };
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const card = value as { type?: unknown; properties?: Record<string, unknown> };
	const types = Array.isArray(card.type) ? card.type : [card.type];
	if (!types.includes('h-card') || !card.properties || typeof card.properties !== 'object') return undefined;
	const url = first(card.properties.url);
	if (!web(url)) return undefined;
	const photoValue = first(card.properties.photo);
	const photo = typeof photoValue === 'object' && photoValue ? (photoValue as { value?: unknown }).value : photoValue;
	return { name: text(card.properties.name) || text(card.properties.nickname) || urlLabel(url), url, ...(web(photo) ? { photo } : {}) };
}

/** Splits a post's `category` into topic tags and person tags, keeping their order. */
export function splitCategories(value: unknown): { tags: string[]; people: PersonTag[] } {
	const values = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
	const tags: string[] = [];
	const people: PersonTag[] = [];
	for (const item of values) {
		const person = personTag(item);
		if (person) { if (!people.some(other => other.url === person.url)) people.push(person); }
		else if (typeof item === 'string' && item.trim()) tags.push(item);
	}
	return { tags, people };
}

/** The clean h-card stored for a person tag, dropping anything else a client sent. */
export function personCard(person: PersonTag) {
	return { type: ['h-card'], properties: { name: [person.name], url: [person.url], ...(person.photo ? { photo: [person.photo] } : {}) } };
}
