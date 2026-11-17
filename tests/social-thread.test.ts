import { expect, test } from 'bun:test';
import { splitIntoThread, maxThreadPosts } from '../src/lib/social-thread';
import { characterCount } from '../src/lib/social-text';

const fits = (limit: number) => (text: string) => characterCount(text, 'bluesky') <= limit;

test('short text stays one post with its link', () => {
	expect(splitIntoThread('Hello there.', fits(300), 'https://example.com/a/')).toEqual(['Hello there.\n\nhttps://example.com/a/']);
});

test('splits between paragraphs, then sentences, keeping every word', () => {
	const text = 'First paragraph is here.\nSecond one. It has two sentences that run on for a while.\n\nThird.';
	const posts = splitIntoThread(text, fits(40));
	expect(posts.every(fits(40))).toBe(true);
	expect(posts.slice(0, 2)).toEqual(['First paragraph is here.\nSecond one.', 'It has two sentences that run on for a']);
	expect(posts.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
});

test('long sentences break between words, and long words between characters', () => {
	const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
	const posts = splitIntoThread(words, fits(50));
	expect(posts.every(fits(50))).toBe(true);
	expect(posts.join(' ')).toBe(words);
	const long = '👩🏽‍💻'.repeat(25);
	expect(splitIntoThread(long, fits(10)).join('')).toBe(long);
});

test('a link that does not fit the last post gets its own', () => {
	const link = 'https://example.com/2026/11/17/post/';
	const posts = splitIntoThread('x'.repeat(290), fits(300), link);
	expect(posts).toEqual(['x'.repeat(290), link]);
});

test('threads stop at the longest the server accepts', () => {
	expect(splitIntoThread('word '.repeat(1000), fits(10)).length).toBe(maxThreadPosts);
});
