import { expect, test } from 'bun:test';
import { wikiPages, wikiSearchContent, loadWikiDocuments } from '../utils/wiki-search';

test('only sitemap-listed Markdown pages use canonical URLs and metadata', () => {
 const pages = wikiPages({
  'Art Under Risk.md': { frontmatter: { permalink: 'art-under-risk', tags: ['art'], year: 2024, aliases: ['AUR'] } },
  'Now.md': {},
  'Secret.md': { frontmatter: { publish: false } },
  'Unlisted.md': {},
  'image.png': null
 }, '<urlset><loc>https://cag.wiki/art-under-risk</loc><loc>https://cag.wiki/Now</loc><loc>https://cag.wiki/Secret</loc></urlset>');
 expect(pages.map(page => page.url)).toEqual(['https://cag.wiki/art-under-risk', 'https://cag.wiki/Now']);
 expect(pages[0]).toMatchObject({title: 'Art Under Risk', tags: ['art'], year: ['2024'], aliases: ['AUR']});
});

test('searchable prose removes frontmatter, comments, and attachment names and keeps wikilink labels', () => {
 const html = wikiSearchContent('---\npublish: true\npermalink: hidden-slug\n---\nGovernance [[Topic|Visible label]] ![[image.png]] %%private comment%%', ['AUR']);
 expect(html).toContain('Governance Visible label');
 expect(html).toContain('AUR');
 for (const text of ['hidden-slug', 'publish:', 'image.png', 'private comment', '[[']) expect(html).not.toContain(text);
});

test('failed remote reads fail indexing', async () => {
 const fetcher = (async () => new Response('Unavailable', {status: 503}));
 await expect(loadWikiDocuments(fetcher, {retryDelayMs: 0})).rejects.toThrow('Wiki indexing: 503');
});

test('sitemap URLs that encode spaces as + still match their pages', () => {
 const pages = wikiPages({'Dog Names Overheard.md': null, 'Notes/A & B.md': {}}, '<urlset><loc>https://cag.wiki/Dog+Names+Overheard</loc><loc>https://cag.wiki/Notes/A%20&amp;%20B</loc></urlset>');
 expect(pages.map(page => [page.title, page.url])).toEqual([['Dog Names Overheard', 'https://cag.wiki/Dog+Names+Overheard'], ['A & B', 'https://cag.wiki/Notes/A%20&%20B']]);
});

test('transient fetch failures are retried', async () => {
 let calls = 0;
 const fetcher = async (url: string) => {
  if (url.includes('sitemap') && calls++ === 0) throw new DOMException('The operation timed out.', 'TimeoutError');
  if (url.includes('sitemap')) return new Response('<urlset><loc>https://cag.wiki/Now</loc></urlset>');
  if (url.includes('/cache/')) return new Response(JSON.stringify({'Now.md': {}}));
  return new Response('Now page');
 };
 const documents = await loadWikiDocuments(fetcher, {retryDelayMs: 0});
 expect(calls).toBe(2);
 expect(documents.map(page => page.url)).toEqual(['https://cag.wiki/Now']);
});

test('client errors are not retried', async () => {
 let calls = 0;
 const fetcher = async () => { calls++; return new Response('Missing', {status: 404}); };
 await expect(loadWikiDocuments(fetcher, {retryDelayMs: 0})).rejects.toThrow('Wiki indexing: 404');
 expect(calls).toBe(2);
});
