import { describe, expect, test } from 'bun:test';
import { parsePost } from '../src/lib/server/parse-post';
import { movedPost, postPath, slugify, SLUG_PATTERN } from '../src/lib/post-slug';

const at = (path: string) => { const [, year, month, day, slug] = path.split('/'); return { year, month, day, slug }; };

describe('renamed posts', () => {
	const renamed = parsePost('---\ndate: 2026-11-14T10:00:00-05:00\n_micropubPreviousUrls:\n  - /2026/11/14/writing-again-7e155168/\n---\nHi', 'notes', '2026-11-14-writing-again.md');
	test('parse their earlier addresses and redirect from them', () => {
		expect(renamed.previousUrls).toEqual(['/2026/11/14/writing-again-7e155168/']);
		expect(movedPost([renamed], at('/2026/11/14/writing-again-7e155168/'))).toBe(renamed);
		expect(movedPost([renamed], at('/2026/11/14/other/'))).toBeUndefined();
	});
	test('a post living at an old address wins over the redirect', () => {
		const reused = parsePost('---\ndate: 2026-11-14T12:00:00-05:00\n---\nNew', 'notes', '2026-11-14-writing-again-7e155168.md');
		expect(movedPost([renamed, reused], at('/2026/11/14/writing-again-7e155168/'))).toBeUndefined();
	});
	test('slugify makes typed text into a valid slug', () => {
		expect(slugify('My Trip, Day 2!')).toBe('my-trip-day-2');
		expect(slugify('  Café  ')).toBe('café');
		expect(slugify('---')).toBe('');
		expect(SLUG_PATTERN.test(slugify('A — B'))).toBe(true);
		expect(postPath('2026-11-14T10:00:00-05:00', 'x')).toBe('/2026/11/14/x/');
	});
});
