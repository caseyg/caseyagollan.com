import { describe, expect, test } from 'bun:test';
import { serializeAtom, serializeJsonFeed, serializeRss } from '../src/lib/server/feeds';
import type { Post } from '../src/lib/posts-types';
const post = (extra: Partial<Post> = {}): Post => ({ slug: 'hello', type: 'note', date: '2026-11-05T23:30:00-05:00', content: '**Hello** & world', filePath: 'notes/hello.md', ...extra });

describe('public feeds', () => {
 test('filters nonpublic and invalid records before limiting and preserves local permalink dates', () => {
  const posts = [post({ draft: true }), post({ deleted: true }), post({ visibility: 'private' }), post({ postStatus: 'draft' }), post({ date: 'invalid' }), post()];
  const feed = JSON.parse(serializeJsonFeed(posts, 1));
  expect(feed.items).toHaveLength(1);
  expect(feed.items[0].url).toBe('https://caseyagollan.com/2026/11/05/hello/');
  expect(feed.items[0].content_html).toContain('<strong>Hello</strong>');
  expect(feed.items[0].date_published).toBe('2026-11-06T04:30:00.000Z');
 });
 test('escapes XML metadata and HTML content including CDATA terminators and illegal controls', () => {
  const posts = [post({ title: 'A & <B>\u0001', content: 'literal ]]> & <tag>', contentFormat: 'text' })];
  for (const xml of [serializeRss(posts), serializeAtom(posts)]) {
   expect(xml).toContain('A &amp; &lt;B&gt;');
   expect(xml).not.toContain('\u0001');
   expect(xml).not.toContain('literal ]]>');
   expect(xml).toMatch(/&amp;(?:amp;|#x26;)/);
  }
 });
 test('includes safe media and excludes executable media URLs', () => {
  const posts = [post({ photo: [{ url: '/photo.jpg', alt: 'A & B' }, { url: 'javascript:alert(1)' }], video: [{ url: 'https://media.example/video.mp4', type: 'video/mp4' }] })];
  const feed = JSON.parse(serializeJsonFeed(posts));
  expect(feed.items[0].content_html).toContain('https://caseyagollan.com/photo.jpg');
  expect(feed.items[0].content_html).toContain('<video');
  expect(feed.items[0].content_html).not.toContain('javascript:');
  expect(feed.items[0].attachments[0]).toMatchObject({ url: 'https://media.example/video.mp4', mime_type: 'video/mp4' });
  expect(serializeAtom(posts)).toContain('rel="enclosure"');
  expect(serializeRss(posts)).toContain('<enclosure');
 });
 test('sanitizes rich HTML before emitting it in any feed', () => {
  const posts = [post({ contentFormat: 'html', content: '<p class="p-name">Hello</p><script>alert(1)</script><img src="javascript:alert(2)" onerror="alert(3)">' })];
  const html = JSON.parse(serializeJsonFeed(posts)).items[0].content_html;
  expect(html).toContain('<p class="p-name">Hello</p>');
  for (const output of [html, serializeAtom(posts), serializeRss(posts)]) {
   expect(output).not.toContain('alert(1)');
   expect(output).not.toContain('onerror');
   expect(output).not.toContain('javascript:');
  }
 });
 test('tracks edits without changing publication order, dates, or exposing drafts', () => {
  const posts = [post({ slug: 'older', updated: '2026-11-10T00:00:00Z' }), post({ slug: 'newer', date: '2026-11-07T00:00:00Z', updated: 'invalid' }), post({ draft: true, updated: '2099-01-01T00:00:00Z' })];
  const feed = JSON.parse(serializeJsonFeed(posts));
  expect(feed.items.map((item: {url:string}) => item.url)).toEqual(['https://caseyagollan.com/2026/11/07/newer/', 'https://caseyagollan.com/2026/11/05/older/']);
  expect(feed.items[0].date_modified).toBeUndefined();
  expect(feed.items[1].date_modified).toBe('2026-11-10T00:00:00.000Z');
  expect(feed.items[1].date_published).toBe('2026-11-06T04:30:00.000Z');
  expect(serializeAtom(posts)).toContain('<updated>2026-11-10T00:00:00.000Z</updated>');
  expect(serializeRss(posts)).toContain('<lastBuildDate>Tue, 10 Nov 2026 00:00:00 GMT</lastBuildDate>');
  expect(serializeAtom(posts, 1)).toContain('<updated>2026-11-07T00:00:00.000Z</updated>');
  expect(JSON.parse(serializeJsonFeed([post({updated:'2020-01-01'})])).items[0].date_modified).toBeUndefined();
  for (const output of [serializeRss(posts), serializeAtom(posts), serializeJsonFeed(posts)]) expect(output).not.toContain('2099');
 });
 test('excludes credentials embedded in media URLs', () => {
  const posts = [post({photo:[{url:'https://user:secret@media.example/a.jpg'}],video:[{url:'https://user@media.example/a.mp4'}]})];
  for (const output of [serializeRss(posts),serializeAtom(posts),serializeJsonFeed(posts)]) {
   expect(output).not.toContain('secret'); expect(output).not.toContain('user@'); expect(output).not.toContain('enclosure');
  }
 });
 test('uses the newest public date, and produces deterministic empty feeds', () => {
  const posts = [post(), post({ slug: 'new', date: '2026-11-07T00:00:00Z' }), post({ draft: true, date: '2030-01-01' })];
  expect(serializeAtom(posts)).toContain('<updated>2026-11-07T00:00:00.000Z</updated>');
  expect(serializeAtom([])).toContain('<updated>1970-01-01T00:00:00.000Z</updated>');
  expect(serializeRss([])).toBe(serializeRss([]));
  expect(JSON.parse(serializeJsonFeed([])).items).toEqual([]);
 });
});
