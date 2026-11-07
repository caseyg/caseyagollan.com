import { error, json } from '@sveltejs/kit';
import { readwiseSession } from '$lib/server/readwise-auth';
import { candidate, listReadwise, privateHeaders, readwiseLedger, validId, type Candidate } from '$lib/server/readwise';
import { publishingConfig } from '$lib/server/publishing/config';
import { createMicropubHandler } from '$lib/server/publishing/micropub';
import { createGitHubStore } from '$lib/server/publishing/github';
import { readDocument } from '$lib/server/publishing/document';
import type { RequestHandler } from './$types';

const handle: RequestHandler = async ({ request, platform, url, setHeaders }) => {
 setHeaders(privateHeaders);
 const session = await readwiseSession(request, platform?.env);
 if (!session) error(401, 'Sign in to use Readwise');
 const config = publishingConfig(platform?.env);
 if (!config) error(503, 'Publishing is not configured');
 const ledger = readwiseLedger(config);
 try {
  if (request.method === 'GET') {
   const token = platform?.env?.READWISE_ACCESS_TOKEN;
   if (!token) error(503, 'READWISE_ACCESS_TOKEN is not configured on the server');
   const { state } = await ledger.read();
   const ignored = new Set([...state.dismissed, ...state.imported]);
   const page = await listReadwise(token, url.searchParams.get('cursor'), config.timeZone);
   return json({ ...page, items: page.items.filter(item => !ignored.has(item.id)) }, { headers: privateHeaders });
  }
  if (request.headers.get('origin') !== url.origin) error(403, 'Cross-site requests are forbidden');
  if (!request.headers.get('content-type')?.startsWith('application/json')) error(415, 'Use JSON');
  const text = await request.text();
  if (text.length > 128 * 1024) error(413, 'Batch too large');
  const body = JSON.parse(text);
  if (body.csrf !== session.csrf) error(403, 'Invalid CSRF token');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) error(400, 'Select between 1 and 20 items per batch');
  if (body.action === 'dismiss') {
   const ids = body.items.map((item: { id: unknown }) => item.id);
   if (!ids.every(validId)) error(400, 'Invalid Readwise IDs');
   await ledger.add('dismissed', ids);
   return json({ results: ids.map((id: string) => ({ id, ok: true })) }, { headers: privateHeaders });
  }
  if (body.action !== 'import') error(400, 'Unknown action');
  const items: Candidate[] = body.items.map((v: Candidate) => {
   const item = candidate({ id: v.id, source_url: v.url, saved_at: v.savedAt, title: v.title }, config.timeZone);
   if (!item) error(400, 'Invalid bookmark');
   return item;
  });
  const { state } = await ledger.read();
  const dismissed = new Set(state.dismissed), imported = new Set(state.imported);
  // Authorization is scoped to this already authenticated, CSRF-checked owner request.
  // No access token is minted or exposed to the browser.
  const micropub = createMicropubHandler({ ...config, introspect: async () => ({ active: true, me: config.me, scope: 'create' }) });
  const store = createGitHubStore(config);
  const results: { id: string; ok: boolean; message?: string; url?: string }[] = [];
  for (const item of items) {
   if (dismissed.has(item.id) || imported.has(item.id)) { results.push({ id: item.id, ok: true }); continue; }
   const slug = `readwise-${item.id}`;
   const path = `bookmarks/${item.savedAt.slice(0, 10)}-${slug}.md`;
   const postUrl = `${new URL(config.me).origin}/${item.savedAt.slice(0, 10).replaceAll('-', '/')}/${slug}/`;
   try {
    // Deterministic paths recover safely after a successful publish but failed ledger write.
    const existing = await store.read(path);
    if (existing) {
     const { properties } = readDocument(existing.content);
     if (properties['bookmark-of']?.[0] !== item.url) throw new Error('Existing bookmark differs; review it before retrying.');
    } else {
     const response = await micropub(new Request(new URL('/micropub', config.me), { method: 'POST', headers: { Authorization: 'Bearer owner-readwise-request', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: ['h-entry'], properties: { name: [item.title], 'bookmark-of': [item.url], published: [item.savedAt], 'mp-slug': [slug] } }) }));
     if (response.status !== 201 && response.status !== 202) throw new Error('Bookmark could not be published. Retry to check its status.');
    }
    imported.add(item.id);
    results.push({ id: item.id, ok: true, url: postUrl });
   } catch { results.push({ id: item.id, ok: false, message: 'Could not finish this import. Retry safely to check or complete it.' }); break; }
  }
  const completed = results.filter(result => result.ok && !dismissed.has(result.id)).map(result => result.id);
  if (completed.length) {
   try { await ledger.add('imported', completed); }
   catch { for (const result of results) { result.ok = false; result.message = 'Published bookmarks need reconciliation. Retry safely.'; } }
  }
  return json({ results }, { headers: privateHeaders });
 } catch (e) {
  if (e && typeof e === 'object' && 'status' in e) throw e;
  error(503, 'Readwise or GitHub is unavailable. Your selections have not been cleared; retry shortly.');
 }
};
export const GET = handle;
export const POST = handle;
