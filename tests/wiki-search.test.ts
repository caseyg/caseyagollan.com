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
 await expect(loadWikiDocuments(fetcher)).rejects.toThrow('Wiki indexing: 503');
});
