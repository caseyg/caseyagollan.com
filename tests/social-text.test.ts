import { expect, test } from 'bun:test';
import { characterCount, mentionQuery } from '../src/lib/social-text';
import { syndicate, syndicationText } from '../src/lib/server/publishing/syndication';
test('provider counts handle graphemes, URLs and remote Mastodon handles', () => {
 expect(characterCount('👨‍👩‍👧‍👦é', 'bluesky')).toBe(2);
 expect(characterCount('https://example.com/' + 'x'.repeat(100), 'mastodon')).toBe(23);
 expect(characterCount('@alice@example.social', 'mastodon')).toBe(6);
 expect(mentionQuery('Hello @ali', 10)).toEqual({ start: 6, end: 10, query: 'ali' });
 expect(mentionQuery('email@example.com', 17)).toBeNull();
 const draft = 'x'.repeat(470) + ' https://example.com/' + 'x'.repeat(100);
 expect(syndicationText({ url:'https://example.com',text:'',draft,published:'2026-11-13',idempotencyKey:'a' },500,Infinity,'mastodon')).toBe(draft);
});
test('Bluesky mentions resolve to DID facets with UTF-8 offsets and deduplicated lookups', async () => {
 const draft = '🦋 @alice.example and @alice.example'; let lookups = 0;
 await syndicate('bluesky', { url:'https://example.com',text:'',draft,published:'2026-11-13',idempotencyKey:'mention' }, { bluesky:{ service:'https://bsky.social',identifier:'test',password:'fake' } }, async (url,init) => {
  if (url.endsWith('createSession')) return Response.json({did:'did:plc:test',accessJwt:'fake'});
  if (url.includes('resolveHandle')) { lookups++; return Response.json({did:'did:plc:alice'}); }
  const {record} = JSON.parse(String(init?.body));
  expect(record.facets).toHaveLength(2);
  for (const facet of record.facets) {
   expect(new TextDecoder().decode(new TextEncoder().encode(draft).slice(facet.index.byteStart,facet.index.byteEnd))).toBe('@alice.example');
   expect(facet.features[0].did).toBe('did:plc:alice');
  }
  return Response.json({});
 });
 expect(lookups).toBe(1);
});
