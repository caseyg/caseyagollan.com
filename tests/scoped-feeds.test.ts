import { describe, expect, test } from 'bun:test';
import { serializeAtom, serializeJsonFeed, serializeRss } from '../src/lib/server/feeds';
import { SITE_FEEDS, tagFeeds, typeFeeds } from '../src/lib/feeds';
import { onThisDay, postLine } from '../src/lib/on-this-day';
import type { Post } from '../src/lib/posts-types';

const post = (extra: Partial<Post> = {}): Post => ({ slug: 'hello', type: 'note', date: '2026-11-18T09:00:00-05:00', content: 'Hello', filePath: 'notes/hello.md', ...extra });

describe('per-type and per-tag feeds', () => {
	test('every scope offers RSS, Atom and JSON Feed under its own page', () => {
		expect(SITE_FEEDS.map((feed) => feed.path)).toEqual(['/feed.xml', '/atom.xml', '/feed.json']);
		expect(typeFeeds('photos').map((feed) => feed.path)).toEqual(['/type/photos/feed.xml', '/type/photos/atom.xml', '/type/photos/feed.json']);
		expect(tagFeeds('IndieWeb')[0].path).toBe('/tags/indieweb/feed.xml');
		expect(tagFeeds('two words')[0].path).toBe('/tags/two%20words/feed.xml');
	});

	test('a scoped feed names itself, its page and its own address', () => {
		const options = { title: 'Casey Gollan: Photos', description: 'Photos by Casey Gollan', home: '/type/photos', base: '/type/photos/' };
		const json = JSON.parse(serializeJsonFeed([post()], 50, options));
		expect(json).toMatchObject({ title: 'Casey Gollan: Photos', home_page_url: 'https://caseyagollan.com/type/photos', feed_url: 'https://caseyagollan.com/type/photos/feed.json' });
		expect(serializeRss([post()], 50, options)).toContain('<atom:link href="https://caseyagollan.com/type/photos/feed.xml" rel="self"');
		const atom = serializeAtom([post()], 50, { ...options, title: 'A & B' });
		expect(atom).toContain('<title>A &amp; B</title>');
		expect(atom).toContain('<link href="https://caseyagollan.com/type/photos/atom.xml" rel="self"');
	});

	test('the site feed is unchanged without options', () => {
		expect(JSON.parse(serializeJsonFeed([])).feed_url).toBe('https://caseyagollan.com/feed.json');
		expect(serializeAtom([])).toContain('<id>https://caseyagollan.com/</id>');
	});
});

describe('on this day', () => {
	const posts = [
		post({ slug: 'today' }),
		post({ slug: 'other-day', date: '2024-11-19T09:00:00-05:00' }),
		post({ slug: 'late', date: '2021-11-18T23:30:00-05:00', title: 'Late' }),
		post({ slug: 'early', date: '2021-11-18T07:00:00-05:00', title: 'Early' }),
		post({ slug: 'extra', date: '2021-11-18T12:00:00-05:00' }),
		post({ slug: 'old', date: '2018-11-18T12:00:00-05:00', photo: [{ url: '/a.jpg', alt: 'A' }] })
	];

	test('groups other years on the same month and day, newest year first, by local date', () => {
		const years = onThisDay(posts, '2026-11-18', 2);
		expect(years.map((year) => year.year)).toEqual(['2021', '2018']);
		expect(years[0]).toMatchObject({ href: '/2021/11/18/', total: 3 });
		expect(years[0].items.map((item) => item.text)).toEqual(['Early', 'Hello']);
		expect(years[1].items[0]).toMatchObject({ href: '/2018/11/18/old/', icon: '📝', photo: { url: '/a.jpg', alt: 'A' } });
	});

	test('includes later years when read from an older day', () => {
		expect(onThisDay(posts, '2018-11-18').map((year) => year.year)).toEqual(['2026', '2021']);
	});

	test('names a post by title, then text, then what it points at', () => {
		expect(postLine(post({ content: 'Read [this](https://x.test) **now**' }))).toBe('Read this now');
		expect(postLine(post({ type: 'like', content: '', properties: { 'like-of': ['https://www.example.com/ideas'] } }))).toBe('example.com/ideas');
		expect(postLine(post({ content: 'x'.repeat(200) })).length).toBe(141);
		const saved = { author: { name: 'Nate', handle: '@nate', url: '' }, html: '<p>Hello <b>there</b></p>' } as NonNullable<Post['socialSnapshots']>[number];
		expect(postLine(post({ type: 'like', content: '', socialSnapshots: [saved] }))).toBe('Nate: Hello there');
	});
});
