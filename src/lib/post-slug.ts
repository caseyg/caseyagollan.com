import { getPostPermalink } from './posts-types';

/** A post's address segment, as the composer and editor accept it: letters, numbers and hyphens. */
export const SLUG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,119}$/u;

/** Turns typed text into a slug: "My Trip, Day 2" becomes "my-trip-day-2". */
export function slugify(value: string, max = 120): string {
	return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+/, '').slice(0, max).replace(/-+$/, '');
}

/** The path a post had at an earlier slug, such as /2026/11/14/old-slug/. */
export function postPath(date: string, slug: string): string {
	return `/${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}/${slug}/`;
}

/**
 * Where a post moved when its slug changed. A post that still lives at this
 * address wins, so an old slug can be reused by a newer post.
 */
export function movedPost<T extends { date: string; slug: string; previousUrls?: string[] }>(posts: T[], { year, month, day, slug }: { year: string; month: string; day: string; slug: string }): T | undefined {
	const path = `/${year}/${month}/${day}/${slug}/`;
	if (posts.some(post => getPostPermalink(post) === path)) return;
	return posts.find(post => post.previousUrls?.includes(path));
}
