import { describe, expect, test } from 'bun:test';
import { createMicropubHandler, type PublishingConfig } from '../src/lib/server/publishing/micropub';
import { categoryList, contactsFrom, followedContacts } from '../src/lib/server/publishing/micropub-queries';
import { parsePost } from '../src/lib/server/parse-post';
import { personTag, splitCategories } from '../src/lib/person-tags';

const config: PublishingConfig = {
  me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect', introspectionToken: 'server-secret',
  owner: 'caseyg', repo: 'test-content', branch: 'test', token: 'git-secret', timeZone: 'America/New_York'
};
const fetcher = async () => Response.json({ active: true, me: config.me, scope: 'create' });
const contacts = () => contactsFrom([
  { service: 'mastodon', handle: 'aaronpk@aaronparecki.com', name: 'Aaron Parecki' },
  { service: 'bluesky', handle: 'aaronpk.bsky.social', name: 'Aaron Parecki' },
  { service: 'bluesky', handle: 'tantek.com', name: 'Tantek Çelik' },
  { service: 'mastodon', handle: 'zara@example.social', name: 'Zara Faron' }
]);
const handler = createMicropubHandler(config, { fetcher, categories: () => ['indieweb', 'books', 'micropub', 'art'], contacts });
const query = async (value: string) => {
  const response = await handler(new Request(`https://example.com/micropub?${value}`, { headers: { Authorization: 'Bearer client' } }));
  return { status: response.status, body: await response.json() as any };
};

describe('Micropub q=category', () => {
  test('lists existing tags, most used first, and filters them', async () => {
    expect((await query('q=category')).body).toEqual({ categories: ['indieweb', 'books', 'micropub', 'art'] });
    expect((await query('q=category&filter=MICRO')).body).toEqual({ categories: ['micropub'] });
    // A word start ranks before a match inside a word, then usage order.
    expect((await query('q=category&filter=b')).body.categories).toEqual(['books', 'indieweb', 'micropub']);
    expect((await query('q=category&filter=%23ind')).body.categories).toEqual(['indieweb']);
    expect((await query('q=category&limit=2')).body.categories).toEqual(['indieweb', 'books']);
    expect((await query('q=category&limit=two')).status).toBe(400);
  });

  test('ranks by use and folds spellings that differ by case', () => {
    expect(categoryList([['IndieWeb', 3], ['indieweb', 1], ['art', 2], ['books', 9]])).toEqual(['books', 'IndieWeb', 'art']);
  });

  test('requires a token like every other query', async () => {
    const open = createMicropubHandler(config, { fetcher: async () => Response.json({ active: false }) });
    expect((await open(new Request('https://example.com/micropub?q=category', { headers: { Authorization: 'Bearer bad' } }))).status).toBe(401);
  });
});

describe('Micropub q=contact', () => {
  test('returns followed accounts as contacts, one per person', async () => {
    const { body } = await query('q=contact');
    expect(body.contacts).toEqual([
      { name: 'Aaron Parecki', nickname: 'aaronpk@aaronparecki.com', url: 'https://aaronparecki.com/@aaronpk', silos: { mastodon: 'aaronpk@aaronparecki.com', bluesky: 'aaronpk.bsky.social' } },
      { name: 'Tantek Çelik', nickname: 'tantek.com', url: 'https://bsky.app/profile/tantek.com', silos: { bluesky: 'tantek.com' } },
      { name: 'Zara Faron', nickname: 'zara@example.social', url: 'https://example.social/@zara', silos: { mastodon: 'zara@example.social' } }
    ]);
  });

  test('searches names and handles, accent-insensitively', async () => {
    expect((await query('q=contact&search=celik')).body.contacts.map((c: any) => c.name)).toEqual(['Tantek Çelik']);
    expect((await query('q=contact&search=%40aaronpk.bsky')).body.contacts.map((c: any) => c.name)).toEqual(['Aaron Parecki']);
    // A word start ("Faron") ranks before a match inside a word ("Aaron").
    expect((await query('q=contact&search=fa')).body.contacts.map((c: any) => c.name)).toEqual(['Zara Faron']);
    expect((await query('q=contact&search=ron')).body.contacts.map((c: any) => c.name)).toEqual(['Aaron Parecki', 'Zara Faron']);
    expect((await query('q=contact&search=par')).body.contacts.map((c: any) => c.name)).toEqual(['Aaron Parecki']);
    expect((await query('q=contact&filter=zara')).body.contacts).toHaveLength(1);
  });

  test('builds from social-follows.json by default', () => {
    const all = followedContacts();
    expect(all.length).toBeGreaterThan(100);
    expect(all.every(contact => contact.url.startsWith('https://') && contact.name && Object.keys(contact.silos).length)).toBe(true);
  });
});

describe('q=config', () => {
  test('advertises category and contact', async () => {
    expect((await query('q=config')).body.q).toEqual(expect.arrayContaining(['category', 'contact', 'source']));
  });
});

describe('Person tags', () => {
  test('reads h-cards and profile URLs, and leaves words as tags', () => {
    expect(personTag('indieweb')).toBeUndefined();
    expect(personTag('https://social.coop/@caseyg/')).toEqual({ name: 'social.coop/@caseyg', url: 'https://social.coop/@caseyg/' });
    expect(personTag({ type: ['h-card'], properties: { name: ['Aaron'], url: ['https://aaronparecki.com/'], photo: [{ value: 'https://aaronparecki.com/photo.jpg', alt: '' }] } }))
      .toEqual({ name: 'Aaron', url: 'https://aaronparecki.com/', photo: 'https://aaronparecki.com/photo.jpg' });
    expect(personTag({ type: ['h-card'], properties: { name: ['No link'] } })).toBeUndefined();
    expect(personTag({ type: ['h-card'], properties: { name: ['Bad'], url: ['javascript:alert(1)'] } })).toBeUndefined();
    expect(splitCategories(['a', { type: ['h-card'], properties: { name: ['A'], url: ['https://a.example/'] } }, 'b']))
      .toEqual({ tags: ['a', 'b'], people: [{ name: 'A', url: 'https://a.example/' }] });
  });

  test('a post keeps topic tags in category and puts people beside them', () => {
    const post = parsePost('---\ndate: "2026-11-17T12:00:00-05:00"\ncategory:\n  - indieweb\n  - type: [h-card]\n    properties:\n      name: [Aaron Parecki]\n      url: ["https://aaronparecki.com/"]\n---\nHi', 'notes', '2026-11-17-hi.md');
    expect(post.category).toEqual(['indieweb']);
    expect(post.people).toEqual([{ name: 'Aaron Parecki', url: 'https://aaronparecki.com/' }]);
    const plain = parsePost('---\ndate: "2026-11-17T12:00:00-05:00"\ncategory: books\n---\nHi', 'notes', '2026-11-17-hi.md');
    expect(plain.category).toBe('books');
    expect(plain.people).toBeUndefined();
  });
});
