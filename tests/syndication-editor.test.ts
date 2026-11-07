import { expect, test } from 'bun:test';
import { editorSession, validateEditorSubmission, editorDestinations, sendEditorDrafts } from '../src/lib/server/publishing/syndication-editor';
import { syndicate } from '../src/lib/server/publishing/syndication';
import { syndicationOnce, syndicationReceiptKey } from '../src/lib/server/publishing/delivery';
import { parsePost } from '../src/lib/server/parse-post';
import { publicationForPost } from '../src/lib/server/publishing/publication';
import { readDocument } from '../src/lib/server/publishing/document';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';
import type { AuthRPC } from '../src/lib/server/indieauth/contracts';
import type { DeliveryEvent } from '../src/lib/server/publishing/outbox';

const markdown = '---\ndate: 2026-11-06T12:00:00-05:00\n---\nOriginal post';
const post = parsePost(markdown, 'notes', '2026-11-06-note.md');
function setup() {
 const rows = new Map<string, { etag: string; value: string }>(); let version = 0;
 const bucket = {
  async get(key: string) { const row = rows.get(key); return row ? { etag: row.etag, json: async () => JSON.parse(row.value) } : null; },
  async put(key: string, value: string, options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }) {
   const old = rows.get(key), condition = options?.onlyIf;
   if (condition?.etagMatches && old?.etag !== condition.etagMatches || condition?.etagDoesNotMatch === '*' && old) return null;
   const result = { etag: String(++version), value }; rows.set(key, result); return result;
  }
 } as unknown as R2Bucket;
 const config: PublishingConfig = { me: 'https://example.com/', owner: 'caseyg', repo: 'content', branch: 'main', token: 'fake-git', timeZone: 'America/New_York', introspectionEndpoint: 'https://example.com/auth/introspect', state: bucket,
  syndication: { mastodon: { instance: 'https://social.coop', token: 'fake' }, bluesky: { service: 'https://bsky.social', identifier: 'test', password: 'fake' } } };
 let content = markdown; let failWrite = false; let writes = 0;
 const gitFetch = (async (url: string, init: RequestInit) => {
  if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'head' } });
  if (url.endsWith('/graphql')) {
   if (failWrite) throw Error('network');
   const input = JSON.parse(String(init.body)).variables.input;
   content = Buffer.from(input.fileChanges.additions[0].contents, 'base64').toString(); writes++;
   return Response.json({ data: { createCommitOnBranch: { commit: { oid: 'commit' } } } });
  }
  return Response.json({ type: 'file', path: post.filePath, sha: 'blob', encoding: 'base64', content: Buffer.from(content).toString('base64') });
 }) as typeof fetch;
 return { rows, bucket, config, gitFetch, content: () => content, writes: () => writes, failWrites: (value: boolean) => { failWrite = value; } };
}

test('owner sessions and CSRF reject unauthenticated, expired, and cross-origin submissions', async () => {
 const session = { csrf: 'secret', expiresAt: Date.now() + 60000 };
 const rpc = { invoke: async (_op: string, input: { token: string }) => input.token === 'owner' ? session : null } as unknown as AuthRPC;
 const env = { AUTH_ENABLED: 'true', AUTH_ORIGIN: 'https://example.com/', AUTH_STORE: {} as DurableObjectNamespace };
 expect(await editorSession(new Request('https://example.com/post'), env, rpc)).toBeNull();
 expect(await editorSession(new Request('https://example.com/post', { headers: { cookie: '__Host-indieauth-session=owner' } }), env, rpc)).toEqual(session);
 const request = new Request('https://example.com/post', { method: 'POST', headers: { origin: 'https://example.com' } });
 await expect(validateEditorSubmission(request, session, 'secret')).resolves.toBeUndefined();
 await expect(validateEditorSubmission(request, null, 'secret')).rejects.toMatchObject({ status: 401 });
 await expect(validateEditorSubmission(request, session, 'wrong')).rejects.toMatchObject({ status: 403 });
 await expect(validateEditorSubmission(new Request(request, { headers: { origin: 'https://evil.example' } }), session, 'secret')).rejects.toMatchObject({ status: 403 });
});

test('existing links use exact provider origins and prevent sends', async () => {
 const app = setup();
 const existing = { ...post, syndication: ['https://bsky.app/profile/test/post/1', 'https://bsky.app.evil.example/post/1', 'https://social.coop/@caseyg/1'] };
 const destinations = await editorDestinations(app.config, existing);
 expect(destinations.map(d => d.links.length)).toEqual([1, 1]);
 const publication = await publicationForPost(existing, app.config.me);
 const message = await sendEditorDrafts(app.config, existing, publication.revision, ['bluesky', 'mastodon'], {}, { publicFetch: async () => { throw Error('must not send'); }, gitFetch: app.gitFetch });
 expect(message).toContain('already syndicated');
 expect(app.rows.size).toBe(0);
});

test('all drafts and source revision are validated before any send', async () => {
 const app = setup(), publication = await publicationForPost(post, app.config.me);
 let calls = 0;
 const dependencies = { publicFetch: async () => { calls++; return Response.json({}); }, gitFetch: app.gitFetch };
 await expect(sendEditorDrafts(app.config, post, 'stale', ['bluesky'], { bluesky: 'hello' }, dependencies)).rejects.toMatchObject({ status: 409 });
 await expect(sendEditorDrafts(app.config, post, publication.revision, ['bluesky', 'mastodon'], { bluesky: 'valid', mastodon: 'x'.repeat(501) }, dependencies)).rejects.toMatchObject({ status: 422 });
 await expect(sendEditorDrafts(app.config, post, publication.revision, ['unknown'], {}, dependencies)).rejects.toMatchObject({ status: 422 });
 await expect(sendEditorDrafts(app.config, { ...post, visibility: 'private' }, publication.revision, ['bluesky'], { bluesky: 'hello' }, dependencies)).rejects.toMatchObject({ status: 409 });
 expect(calls).toBe(0); expect(app.rows.size).toBe(0);
});

test('separate exact drafts write URLs to GitHub and repeat submissions do not resend', async () => {
 const app = setup(), publication = await publicationForPost(post, app.config.me);
 const bodies: Record<string, unknown>[] = []; let mastodonText = '';
 const publicFetch = async (url: string, init?: RequestInit) => {
  if (url.endsWith('/api/v1/statuses')) { mastodonText = new URLSearchParams(String(init?.body)).get('status')!; return Response.json({ url: 'https://social.coop/@caseyg/123' }); }
  if (url.endsWith('createSession')) return Response.json({ did: 'did:plc:test', accessJwt: 'fake' });
  bodies.push(JSON.parse(String(init?.body))); return Response.json({});
 };
 const message = await sendEditorDrafts(app.config, post, publication.revision, ['bluesky', 'mastodon'], { bluesky: '🦋 Edited Bluesky', mastodon: 'Edited Mastodon' }, { publicFetch, gitFetch: app.gitFetch });
 expect(message).toContain('Bluesky sent'); expect(message).toContain('Mastodon sent');
 expect((bodies[0].record as { text: string; facets: unknown[] }).text).toBe('🦋 Edited Bluesky');
 expect((bodies[0].record as { facets: unknown[] }).facets).toEqual([]);
 expect(mastodonText).toBe('Edited Mastodon');
 expect(readDocument(app.content()).properties.syndication).toHaveLength(2); expect(app.writes()).toBe(1);
 await sendEditorDrafts(app.config, post, publication.revision, ['bluesky', 'mastodon'], {}, { publicFetch, gitFetch: app.gitFetch });
 expect(bodies.length).toBe(1); expect(app.writes()).toBe(1);
});

test('partial failure retains successful links; sync retries GitHub without sending checked destinations', async () => {
 const app = setup(), publication = await publicationForPost(post, app.config.me);
 app.failWrites(true); let sends = 0;
 const publicFetch = async (url: string) => {
  sends++; if (url.includes('bsky.social')) throw Error('ambiguous timeout');
  return Response.json({ url: 'https://social.coop/@caseyg/123' });
 };
 const message = await sendEditorDrafts(app.config, post, publication.revision, ['bluesky', 'mastodon'], { bluesky: 'B', mastodon: 'M' }, { publicFetch, gitFetch: app.gitFetch });
 expect(message).toContain('could not be confirmed'); expect(message).toContain('GitHub update failed');
 const states = await editorDestinations(app.config, post);
 expect(states.find(d => d.service === 'bluesky')?.pending).toBe(true);
 expect(states.find(d => d.service === 'mastodon')?.links).toEqual(['https://social.coop/@caseyg/123']);
 app.failWrites(false);
 await sendEditorDrafts(app.config, post, publication.revision, ['bluesky'], { bluesky: 'do not send' }, { syncOnly: true, publicFetch, gitFetch: app.gitFetch });
 expect(sends).toBe(2); expect(readDocument(app.content()).properties.syndication).toEqual(['https://social.coop/@caseyg/123']);
});

test('manual sends and automatic delivery share claims and preserve the first draft through retry', async () => {
 const app = setup(), publication = await publicationForPost(post, app.config.me);
 const event: DeliveryEvent = { source: publication.url, revision: publication.revision, action: 'publish', targets: [], syndicateTo: ['mastodon'], text: 'Original', published: publication.published };
 let calls = 0;
 const first = async () => { calls++; await Promise.resolve(); return Response.json({ url: 'https://social.coop/@caseyg/123' }); };
 await Promise.allSettled([syndicationOnce(app.bucket, event, 'mastodon', app.config.syndication!, first, () => 1, 'Reviewed draft'), syndicationOnce(app.bucket, event, 'mastodon', app.config.syndication!, first, () => 1)]);
 expect(calls).toBe(1);
 const key = await syndicationReceiptKey(publication.url, 'mastodon');
 app.rows.clear();
 await expect(syndicationOnce(app.bucket, event, 'mastodon', app.config.syndication!, async () => { throw Error('timeout'); }, () => 1, 'First draft')).rejects.toThrow();
 let retried = '';
 await syndicationOnce(app.bucket, event, 'mastodon', app.config.syndication!, async (_url, init) => { retried = new URLSearchParams(String(init?.body)).get('status')!; return Response.json({ url: 'https://social.coop/@caseyg/123' }); }, () => 300002, 'Changed draft');
 expect(retried).toBe('First draft'); expect(JSON.parse(app.rows.get(key)!.value).status).toBe('sent');
});

test('edited Bluesky drafts link the canonical URL wherever it appears using byte offsets', async () => {
 const url = 'https://example.com/2026/11/06/note/'; const text = `🦋 ${url} more text`;
 await syndicate('bluesky', { url, text: 'unused', draft: text, published: post.date, idempotencyKey: 'test' }, { bluesky: { service: 'https://bsky.social', identifier: 'test', password: 'fake' } }, async (target, init) => {
  if (target.endsWith('createSession')) return Response.json({ did: 'did:plc:test', accessJwt: 'fake' });
  const record = JSON.parse(String(init?.body)).record, index = record.facets[0].index;
  expect(record.text).toBe(text);
  expect(new TextDecoder().decode(new TextEncoder().encode(text).slice(index.byteStart, index.byteEnd))).toBe(url);
  return Response.json({});
 });
});
