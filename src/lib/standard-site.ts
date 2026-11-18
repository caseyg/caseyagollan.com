/**
 * Standard.site (https://standard.site) records for articles, on Casey's AT Protocol repository.
 *
 * The site is one `site.standard.publication`, and each public article is one
 * `site.standard.document` pointing back at its page here. Record keys are worked out from the
 * post itself, so a page can name its record at build time, before the record is written, and a
 * retry always overwrites the same record. Bluesky shows a richer link card for a page whose
 * `<link rel="site.standard.document">` names a record the site verifies.
 */
import { SITE_IDENTITY } from './identity';
import { getPostPermalink } from './posts-types';

/** Casey's AT Protocol identity, which the handle caseyagollan.com resolves to. */
export const ATPROTO_DID = 'did:plc:s3fw2giksymfvruno3tvem4k';
export const PUBLICATION_COLLECTION = 'site.standard.publication';
export const DOCUMENT_COLLECTION = 'site.standard.document';
/** The publication's base URL. Each document's `path` is joined to it, so it has no trailing slash. */
export const PUBLICATION_URL = SITE_IDENTITY.url.replace(/\/$/, '');

const alphabet = '234567abcdefghijklmnopqrstuvwxyz';
/** A record key in TID form: 53 bits of microseconds since 1970, then a 10-bit clock id. */
export function tid(micros: bigint, clock: number): string {
	if (micros < 0n || micros >= 1n << 53n) throw new RangeError('Timestamp is outside TID range');
	let value = (micros << 10n) | BigInt(clock & 1023);
	let key = '';
	for (let i = 0; i < 13; i++) { key = alphabet[Number(value & 31n)] + key; value >>= 5n; }
	return key;
}

/** 32-bit FNV-1a: a small, stable hash that fills the parts of a key a date can't. */
function fnv(text: string): number {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
	return hash;
}

/** Fixed, so the publication's address never changes. */
export const PUBLICATION_RKEY = tid(BigInt(Date.UTC(2026, 10, 18)) * 1000n, 0);
export const PUBLICATION_URI = `at://${ATPROTO_DID}/${PUBLICATION_COLLECTION}/${PUBLICATION_RKEY}`;

export interface StandardPost {
	type: string;
	date: string;
	slug: string;
	title?: string;
	draft?: boolean;
	/** Earlier paths of a renamed post, oldest first. */
	previousUrls?: string[];
}

/** Public articles with a title are documents; notes, likes and the rest are not long-form. */
export function isStandardDocument(post: StandardPost): boolean {
	return post.type === 'article' && !post.draft && !!post.title?.trim() && Number.isFinite(Date.parse(post.date));
}

/**
 * A document's record key: its publish time, with the sub-millisecond digits and clock id taken
 * from its first address. A renamed post keeps its key, since its first address never changes.
 */
export function documentRkey(post: StandardPost): string {
	const first = post.previousUrls?.[0] ?? getPostPermalink(post);
	const hash = fnv(first);
	return tid(BigInt(Date.parse(post.date)) * 1000n + BigInt(hash % 1000), hash >>> 22);
}

export function documentUri(post: StandardPost): string {
	return `at://${ATPROTO_DID}/${DOCUMENT_COLLECTION}/${documentRkey(post)}`;
}
