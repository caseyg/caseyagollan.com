/**
 * The syndication thread as post properties, shared by Micropub clients and the syndicate page.
 * See docs/indieweb-publishing/proposals/micropub-syndication-threads.md.
 */
import type { Json, Properties } from './document';
import { maxThreadPosts } from './syndication';

/** The posts of the social copy, in order; each later one replies to the one before. */
export const THREAD_PROPERTY = 'syndication-thread';
/** Parallel to `photo`: which post of the thread each photo goes on, counted from 0. */
export const PHOTO_POST_PROPERTY = 'syndication-photo-post';
/** Longest text of one post accepted in storage; each network's own limit is checked when sending. */
const maxPostText = 10000;

/** The `q=config` entry that tells clients the endpoint stores threads, and their limits. */
export function threadConfig() {
	return { property: THREAD_PROPERTY, 'photo-property': PHOTO_POST_PROPERTY, 'max-posts': maxThreadPosts, 'max-photos-per-post': 4,
		limits: { bluesky: { characters: 300, 'link-length': 'actual' }, mastodon: { characters: 500, 'link-length': 23 } } };
}

/** A photo-post value: a whole number, sent as JSON or as form text. */
function postIndex(value: Json): number | undefined {
	const index = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
	return Number.isInteger(index) && index >= 0 && index < maxThreadPosts ? index : undefined;
}

/** Check thread properties sent by a client. Returns an error message, or nothing when they are valid. */
export function invalidThreadProperty(key: string, values: Json[]): string | undefined {
	if (key === THREAD_PROPERTY) {
		if (values.length > maxThreadPosts) return `A ${THREAD_PROPERTY} has at most ${maxThreadPosts} posts`;
		if (values.some(value => typeof value !== 'string' || !value.trim() || value.length > maxPostText)) return `Each ${THREAD_PROPERTY} value is the text of one post`;
	}
	if (key === PHOTO_POST_PROPERTY && values.some(value => postIndex(value) === undefined)) return `Each ${PHOTO_POST_PROPERTY} value is a post number from 0 to ${maxThreadPosts - 1}`;
}

/** The stored thread, when the post has one. */
export function storedThread(properties: Record<string, unknown> | undefined): string[] | undefined {
	const values = properties?.[THREAD_PROPERTY];
	const thread = Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && !!value.trim()).slice(0, maxThreadPosts) : [];
	return thread.length ? thread : undefined;
}

/** Each photo's post, in the order of `photo`; missing entries mean the first post. */
export function storedPhotoPosts(properties: Record<string, unknown> | undefined): number[] {
	const values = properties?.[PHOTO_POST_PROPERTY];
	return Array.isArray(values) ? values.map(value => postIndex(value as Json) ?? 0) : [];
}

/** Properties to write for a thread and its photo placement; an empty list removes one. */
export function threadUpdate(thread: string[] | undefined, photoPosts: number[] | undefined): { replace: Properties; delete: string[] } {
	const replace: Properties = {}; const remove: string[] = [];
	if (thread) { if (thread.length > 1) replace[THREAD_PROPERTY] = thread; else remove.push(THREAD_PROPERTY); }
	if (photoPosts) { if (photoPosts.some(Boolean)) replace[PHOTO_POST_PROPERTY] = photoPosts; else remove.push(PHOTO_POST_PROPERTY); }
	return { replace, delete: remove };
}
