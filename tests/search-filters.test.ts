import { expect, test } from 'bun:test';
import { bookTags, bookAuthors, postAuthors, socialHandle, yearFilter } from '../utils/search-filters';
import { parsePost } from '../src/lib/server/parse-post';

test('catalog tags preserve punctuation and merge genres with classification labels', () => {
 expect(bookTags({genre: ['Nonfiction', 'Biography & Memoir', 'Nonfiction'], ddc: {wording: ['Society, government, & culture', 'By Industry']}}))
  .toEqual(['Nonfiction', 'Biography & Memoir', 'Society, government, & culture', 'By Industry']);
});

test('authors include the site owner, syndication handles, and saved social authors', () => {
 const post = parsePost('---\ndate: 2026-11-06\nsyndication:\n - https://bsky.app/profile/did:plc:s3fw2giksymfvruno3tvem4k/post/123\n - https://social.coop/users/caseyg/statuses/123/activity\nrepost-of:\n - https://mastodon.online/@mwichary/117408426938284069\n---\n', 'reposts', '2026-11-06-example.md');
 expect(postAuthors(post)).toEqual(['Casey Gollan', '@caseyagollan.com', '@caseyg@social.coop', '@mwichary@mastodon.online']);
 post.socialSnapshots = [{author: {handle: 'grantcuster.com'}} as any];
 expect(postAuthors(post)).toContain('@grantcuster.com');
 expect(socialHandle('https://bsky.app/profile/did:plc:unknown/post/123')).toBeUndefined();
});

 test('book author filters include coauthors without classifying foreword contributors as authors', () => {
 expect(bookAuthors({primaryauthor: 'Hyde, Lewis', authors: [{lf: 'Hyde, Lewis', role: 'Author'}, {lf: 'Other, Writer', role: 'Author'}, {lf: 'Chabon, Michael', role: 'Foreword'}]})).toEqual(['Hyde, Lewis', 'Other, Writer']);
 });
 test('year facets share book publication years and post calendar years without timezone conversion', () => {
 expect(yearFilter(1999)).toEqual(['1999']);
 expect(yearFilter('2025-12-31T23:30:00-05:00')).toEqual(['2025']);
 expect(yearFilter('')).toEqual([]);
 expect(yearFilter(0)).toEqual([]);
 });
