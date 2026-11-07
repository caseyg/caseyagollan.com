import { expect, test } from 'bun:test';
import { parsePost } from '../src/lib/server/parse-post';
import { createDocument, documentMetadata } from '../src/lib/server/publishing/document';
import { renderPostDetails } from '../src/lib/utils/post-details';
import { serializeJsonFeed } from '../src/lib/server/feeds';
import { publicationForPost, publicationRevision } from '../src/lib/server/publishing/publication';

const post = (folder: string, properties: any, root = 'h-entry') => parsePost(documentMetadata(createDocument({ published: ['2026-11-06T12:00:00-05:00'], ...properties }), root), folder, '2026-11-06-test.md');
test('renders like and repost targets in archives, feeds and delivery', async () => {
 for (const [folder,key,label] of [['likes','like-of','Liked'], ['reposts','repost-of','Reposted']]) {
  const value = post(folder, { [key]: ['https://other.example/post'] });
  expect(renderPostDetails(value)).toContain(label);
  expect(renderPostDetails(value)).toContain(`class="u-${key}"`);
  expect(JSON.parse(serializeJsonFeed([value])).items[0].content_html).toContain('https://other.example/post');
  const publication = await publicationForPost(value);
  expect(publication.targets).toContain('https://other.example/post');
  expect(publication.text).toContain(label);
  expect(await publicationRevision(value)).not.toBe(await publicationRevision(post(folder, { [key]: ['https://other.example/changed'] })));
 }
});
test('renders event venue, conference and presentation data safely', () => {
 const value = post('events', { name: ['Camp'], start: ['2026-11-01T09:00-07:00'], end: ['2026-11-02'], location: [{ type: ['h-card'], properties: { name: ['Venue'], latitude: [45.52], longitude: [-122.68], locality: ['Portland'], region: ['OR'], 'country-name': ['USA'] } }], slides: ['https://other.example/slides'], 'video-embed': ['<iframe src="https://evil.example/embed"></iframe><script>bad()</script>'], conference: [{ type: ['h-event'], properties: { name: ['Conference'], start: ['2026-11-01'] } }] }, 'h-event');
 const html = renderPostDetails(value);
 for (const text of ['dt-start','dt-end','Venue','Portland','Conference','https://other.example/slides']) expect(html).toContain(text);
 expect(html).not.toContain('<script'); expect(html).not.toContain('evil.example');
});
test('renders reviews, itineraries, food/drink and RSVP', () => {
 const review = post('reviews', { item: [{ type: ['h-product'], properties: { name: ['Book'], url: ['https://other.example/book'] } }], rating: [4], best: [5] }, 'h-review');
 expect(renderPostDetails(review)).toContain('4'); expect(renderPostDetails(review)).toContain('p-item h-product');
 const itinerary = post('itineraries', { itinerary: [{ type: ['h-leg'], properties: { 'transit-type': ['air'], operator: ['Alaska'], number: ['123'], origin: ['PDX'], destination: ['SFO'], departure: ['2026-11-06T08:00-05:00'], arrival: ['2026-11-06T10:00-05:00'] } }] });
 for (const text of ['Alaska','123','PDX','SFO','dt-departure','dt-arrival']) expect(renderPostDetails(itinerary)).toContain(text);
 for (const key of ['ate','drank']) expect(renderPostDetails(post(key === 'ate' ? 'foods' : 'drinks', { [key]: [{ type: ['h-food'], properties: { name: ['Americano'] } }] }))).toContain('Americano');
 expect(renderPostDetails(post('replies', { 'in-reply-to': ['https://other.example/event'], rsvp: ['yes'] }))).toContain('p-rsvp');
});
test('escapes malformed legacy data at every rendering boundary', () => {
 const value = post('likes', { 'like-of': ['javascript:alert(1)'], location: ['<img src=x onerror=alert(1)>'] });
 const html = renderPostDetails(value);
 expect(html).not.toContain('href="javascript:'); expect(html).not.toContain('<img');
});

test('revision detects structured source edits even when display text is unchanged', async () => {
 const before = post('notes', { location: ['geo:45.52,-122.68;u=20'] });
 const after = post('notes', { location: ['geo:45.52,-122.68;u=30'] });
 expect(await publicationRevision(before)).not.toBe(await publicationRevision(after));
});
