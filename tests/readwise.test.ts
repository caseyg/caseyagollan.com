import { describe, expect, test } from 'bun:test';
import { candidate, listReadwise, readwiseLedger, ledgerPath, privateHeaders, ReadwiseError, readwisePost, editedReadwise, readwiseProperties, type Candidate } from '../src/lib/server/readwise';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';
import { readwiseSession } from '../src/lib/server/readwise-auth';

const config: PublishingConfig = { owner: 'owner', repo: 'content', branch: 'main', token: 'github-secret', me: 'https://example.com/', introspectionEndpoint: 'https://example.com/auth/introspect', timeZone: 'America/New_York' };
const document = { id: '01reader', source_url: 'https://example.net/article', title: 'Private title', summary: 'Private summary', notes: 'Never publish', saved_at: '2026-11-07T02:00:00Z', category: 'article' };

describe('private Readwise queue', () => {
 test('preserves upstream failures for diagnostics without retaining response bodies', async () => {
  for (const status of [301, 302, 401, 403, 429, 500]) {
   try {
    await listReadwise('secret', null, config.timeZone, (async () => new Response('private response', { status })) as unknown as typeof fetch);
    throw new Error('Expected failure');
   } catch (e) {
    expect(e).toBeInstanceOf(ReadwiseError);
    expect((e as ReadwiseError).upstreamStatus).toBe(status);
    expect(String(e)).not.toMatch(/secret|private response/);
   }
  }
 });
 test('uses saved dates in the publishing timezone and omits notes and raw document data', () => {
  const item = candidate(document, config.timeZone)!;
  expect(item.day).toBe('2026-11-06');
  expect(item.summary).toBe('Private summary');
  expect(item).not.toHaveProperty('notes');
  for (const extra of [{ source_url: 'javascript:alert(1)' }, { source_url: null }, { parent_id: 'parent' }, { category: 'note' }, { saved_at: 'bad-date' }, { id: '../../path' }]) {
   expect(candidate({ ...document, ...extra }, config.timeZone)).toBeNull();
  }
 });
 test('fetches previews with server token and an encoded cursor without requesting HTML', async () => {
  const page = await listReadwise('readwise-secret', 'cursor+/', config.timeZone, (async (url: string, init: RequestInit) => {
   const u = new URL(url);
   expect(u.origin + u.pathname).toBe('https://readwise.io/api/v3/list/');
   expect(u.searchParams.get('pageCursor')).toBe('cursor+/');
   expect(u.searchParams.get('withHtmlContent')).toBe('false');
   expect(new Headers(init.headers).get('authorization')).toBe('Token readwise-secret');
   expect(init.cache).toBe('no-store');
   expect(init.redirect).toBe('manual');
   return Response.json({ results: [document], nextPageCursor: 'next' });
  }) as typeof fetch);
  expect(page.items).toHaveLength(1);
  expect(page.cursor).toBe('next');
  expect(JSON.stringify(page)).not.toContain('readwise-secret');
  expect(privateHeaders['cache-control']).toContain('no-store');
 });
 test('dismissals merge on conflict and write only sorted unique IDs in one ledger', async () => {
  let reads = 0, writes = 0;
  const ledger = readwiseLedger(config, async (url, init) => {
   expect(url).toContain('/contents/' + ledgerPath);
   if (init.method === 'GET') {
    reads++;
    return Response.json({ type: 'file', path: ledgerPath, sha: `sha-${reads}`, encoding: 'base64', content: btoa(JSON.stringify({ dismissed: reads > 1 ? ['concurrent'] : [], imported: ['imported'] })) });
   }
   writes++;
   const body = JSON.parse(init.body as string);
   const state = JSON.parse(atob(body.content));
   expect(body.sha).toBe(`sha-${reads}`);
   expect(Object.keys(state)).toEqual(['dismissed', 'imported']);
   expect(atob(body.content)).not.toMatch(/Private|https:|notes|summary/);
   if (writes === 1) return new Response(null, { status: 409 });
   expect(state).toEqual({ dismissed: ['01reader', 'concurrent'], imported: ['imported'] });
   return Response.json({ content: { sha: 'new' }, commit: { sha: 'commit' } });
  });
  await ledger.add('dismissed', ['01reader', '01reader']);
  expect(writes).toBe(2);
 });
 test('GitHub read failures fail closed rather than presenting dismissed items again', async () => {
  const ledger = readwiseLedger(config, async () => new Response(null, { status: 503 }));
  await expect(ledger.read()).rejects.toThrow();
 });
 test('rejects invalid IDs before a GitHub write', async () => {
  const ledger = readwiseLedger(config, async () => { throw new Error('should not fetch'); });
  await expect(ledger.add('dismissed', ['../../private'])).rejects.toThrow('Invalid Readwise IDs');
 });
 test('owner session check does not accept a random cookie or leak previews', async () => {
  const env = { AUTH_ENABLED: 'true', AUTH_ORIGIN: config.me, AUTH_ME: config.me, AUTH_STORE: {
   idFromName: () => 'owner', get: () => ({ invoke: async (op: string, input: { token: string }) => {
    expect(op).toBe('session'); return input.token === 'valid' ? { csrf: 'csrf', expiresAt: Date.now() + 10000 } : null;
   } })
  } };
  expect(await readwiseSession(new Request(config.me), env as never)).toBeNull();
  expect(await readwiseSession(new Request(config.me, { headers: { cookie: '__Host-indieauth-session=invalid' } }), env as never)).toBeNull();
  expect(await readwiseSession(new Request(config.me, { headers: { cookie: '__Host-indieauth-session=valid' } }), env as never)).toHaveProperty('csrf', 'csrf');
 });
});

test('Readwise URLs omit provider branding and remain stable across editorial changes', () => {
 const item = candidate(document, config.timeZone)!;
 const target = readwisePost(item, config.me);
 expect(target.path).toBe('bookmarks/2026-11-06-01reader.md');
 expect(target.url).toBe('https://example.com/2026/11/06/01reader/');
 expect(readwisePost(Object.assign({}, item, { title: 'Edited', summary: 'Edited' }), config.me)).toEqual(target);
 expect(readwisePost(item, config.me, true).path).toBe('bookmarks/2026-11-06-readwise-01reader.md');
});

test('Readwise previews expose editable tag names but never personal notes', () => {
 const item = candidate({ ...document, tags: { design: {}, books: {} } }, config.timeZone)!;
 expect(item.tags).toEqual(['design', 'books']);
 expect(item).not.toHaveProperty('notes');
});

test('edited summaries become post content and selected tags survive publication', async () => {
 const { createDocument, readDocument } = await import('../src/lib/server/publishing/document');
 const original = candidate(document, config.timeZone)!;
 const edited = editedReadwise({ ...original, summary: 'My edited summary\nwith a second line.', tags: [' design ', 'books', 'design'] }, config.timeZone);
 const properties = readwiseProperties(edited, readwisePost(edited, config.me).slug);
 delete (properties as Partial<typeof properties>)['mp-slug'];
 const published = readDocument(createDocument(properties));
 expect(published.body).toBe(edited.summary);
 expect(published.properties.category).toEqual(['design', 'books']);
 expect(published.body).not.toContain('Private summary');
 expect(published.properties).not.toHaveProperty('notes');
 for (const change of [{ summary: 'x'.repeat(4001) }, { tags: [null] }, { tags: [''] }, { url: 'javascript:alert(1)' }]) {
  expect(() => editedReadwise({ ...original, ...change } as unknown as Candidate, config.timeZone)).toThrow();
 }
});

test('import receipts resolve through GitHub before the bookmark is bundled in a build', async () => {
 const { getGitHubPost } = await import('../src/lib/server/github-posts');
 const { createDocument } = await import('../src/lib/server/publishing/document');
 const item = editedReadwise({ ...candidate(document, config.timeZone)!, summary: 'Approved summary', tags: ['design'] }, config.timeZone);
 const target = readwisePost(item, config.me);
 const properties = readwiseProperties(item, target.slug);
 delete (properties as Partial<typeof properties>)['mp-slug'];
 const markdown = createDocument(properties);
 const post = await getGitHubPost({ year: '2026', month: '11', day: '06', slug: target.slug }, (async (url: string) => url.includes('/contents/' + target.path) ? new Response(markdown) : new Response(null, { status: 404 })) as unknown as typeof fetch, config.token, config);
 expect(post?.slug).toBe(target.slug);
 expect(post?.content).toContain('Approved summary');
 expect(post?.category).toContain('design');
});
