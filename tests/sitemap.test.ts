import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { serializeSitemap } from '../src/lib/server/sitemap';
import type { Post } from '../src/lib/posts-types';
const post = (extra: Partial<Post> = {}): Post => ({ slug: 'hello', type: 'note', date: '2026-11-05T23:30:00-05:00', content: 'Hi', filePath: 'notes/hello.md', ...extra });
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

describe('sitemap', () => {
	test('lists final addresses (no trailing slash) for sections, public posts with lastmod, and their type and tag pages', () => {
		const xml = serializeSitemap([
			post({ category: ['IndieWeb', 'a & b'], updated: '2026-11-07T10:00:00Z' }),
			post({ slug: 'older', type: 'article', date: '2025-01-02T09:00:00Z', category: 'indieweb' }),
			post({ slug: 'secret', visibility: 'private' }),
			post({ slug: 'draft', draft: true }),
			post({ slug: 'gone', deleted: true }),
			post({ slug: 'broken', date: 'nope' })
		]);
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
		const urls = locs(xml);
		expect(urls).toContain('https://caseyagollan.com/');
		expect(urls).toContain('https://caseyagollan.com/posts');
		expect(urls).toContain('https://caseyagollan.com/type/notes');
		expect(urls).toContain('https://caseyagollan.com/type/articles');
		expect(urls).toContain('https://caseyagollan.com/tags/indieweb');
		expect(urls).toContain('https://caseyagollan.com/tags/a%20&amp;%20b');
		expect(urls.filter((url) => url.endsWith('/tags/indieweb'))).toHaveLength(1);
		expect(urls).toContain('https://caseyagollan.com/2026/11/05/hello');
		expect(urls).toContain('https://caseyagollan.com/2025/01/02/older');
		for (const slug of ['secret', 'draft', 'gone', 'broken']) expect(urls.some((url) => url.includes(slug))).toBe(false);
		expect(xml).toContain('<loc>https://caseyagollan.com/2026/11/05/hello</loc><lastmod>2026-11-07T10:00:00.000Z</lastmod>');
		expect(xml).not.toContain('/wiki/some');
	});

	test('robots.txt points at the sitemap', () => {
		expect(readFileSync(new URL('../static/robots.txt', import.meta.url), 'utf8')).toContain('Sitemap: https://caseyagollan.com/sitemap.xml');
	});
});
