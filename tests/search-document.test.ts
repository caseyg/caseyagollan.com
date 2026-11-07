import { expect, test } from 'bun:test';
import { parsePost } from '../src/lib/server/parse-post';
import { postSearchContent, postSearchTitle, searchDocument } from '../utils/search-document';
import type { SocialSnapshot } from '../src/lib/social-snapshots';

const post = parsePost('---\ndate: 2026-11-06T21:32:38-05:00\nlike-of:\n - https://mas.to/@TodePond/117113125625102664\n---\n', 'likes', '2026-11-06-example.md');
const snapshot: SocialSnapshot = {
 version: 1, url: 'https://mas.to/@TodePond/117113125625102664', platform: 'mastodon',
 author: {name: 'Lu wilson', handle: '@TodePond@mas.to', url: 'https://mas.to/@TodePond'},
 published: '2026-08-17T22:08:00.363Z', fetchedAt: '2026-11-07T02:32:38.573Z',
 html: '<p>new blog post:</p><p>"Game of Life"<br><a href="https://www.todepond.com/sky/game-of-life/">todepond.com/sky/game-of-life/</a></p>',
 preview: {url: 'https://www.todepond.com/sky/game-of-life/', title: 'Todepond dot com', description: 'A cellular automata notebook.'}, images: []
};

test('indexes saved social content and all visible link-card text using the page renderer', () => {
 const content = postSearchContent({...post, socialSnapshots: [snapshot]});
 for (const term of ['Game of Life', 'Todepond dot com', 'A cellular automata notebook.', 'www.todepond.com', 'Lu wilson', '@TodePond@mas.to']) expect(content).toContain(term);
 expect(content).toContain('www.todepond.com</span> <strong>Todepond dot com</strong>');
 expect(content.indexOf('Game of Life')).toBeLessThan(content.indexOf('Lu wilson'));
 expect(postSearchTitle({...post, socialSnapshots: [snapshot]})).toBe('Todepond dot com');
});

test('reposts include Bluesky saved text, previews, image alt text, and warning text', () => {
 const social: SocialSnapshot = {...snapshot, platform: 'bluesky', warning: 'Content warning example', images: [{src: 'https://files.caseyagollan.com/publishing/social/' + 'a'.repeat(64) + '.png', alt: 'An automata diagram'}]};
 const content = postSearchContent({...post, type: 'repost', properties: {'repost-of': [snapshot.url]}, socialSnapshots: [social]});
 expect(content).toContain('Game of Life');
 expect(content).toContain('Todepond dot com');
 expect(content).toContain('Content warning example');
 expect(content).toContain('An automata diagram');
});

test('facets and metadata are separate from body prose, with escaped values', () => {
 const html = searchDocument('A title', 'like', {author: 'A & B'}, '<p>Actual body</p>', {Author: ['A & B'], Year: ['2026']});
 expect(html).toContain('<article data-pagefind-body><p>Actual body</p></article>');
 expect(html).toContain('data-pagefind-filter="Author">A &amp; B');
 expect(html).toContain('<div data-pagefind-ignore>');
});
