import { createGitHubStore, GitHubStoreError } from './publishing/github';
import type { PublishingConfig } from './publishing/micropub';

export const ledgerPath = 'integrations/readwise.json';
export const privateHeaders = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow', 'vary': 'Cookie', 'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" };
export interface Candidate { id: string; url: string; title: string; author: string; summary: string; savedAt: string; day: string; category: string }
export interface Ledger { dismissed: string[]; imported: string[] }
export const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
export function webUrl(value: unknown): string | undefined {
 try { const u = new URL(String(value)); if (['https:', 'http:'].includes(u.protocol) && !u.username && !u.password) return u.href; } catch { /* No public source URL. */ }
}
export function candidate(value: Record<string, unknown>, timeZone: string): Candidate | null {
 const url = webUrl(value.source_url);
 const savedAt = typeof value.saved_at === 'string' ? value.saved_at : value.created_at;
 if (!validId(value.id) || !url || value.parent_id || ['highlight', 'note'].includes(String(value.category)) || typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) return null;
 const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(new Date(savedAt));
 const part = (type: string) => parts.find(p => p.type === type)!.value;
 const day = `${part('year')}-${part('month')}-${part('day')}`;
 const timestamp = `${day}T${part('hour')}:${part('minute')}:${part('second')}${part('timeZoneName').replace('GMT', '') || '+00:00'}`;
 const text = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
 return { id: value.id, url, savedAt: timestamp, day, title: text(value.title, 1000) || url, author: text(value.author, 500), summary: text(value.summary, 4000), category: text(value.category, 100) };
}
export async function listReadwise(token: string, cursor: string | null, timeZone: string, fetcher: typeof fetch = fetch) {
 const url = new URL('https://readwise.io/api/v3/list/');
 url.searchParams.set('withHtmlContent', 'false');
 if (cursor) { if (cursor.length > 1024) throw new Error('Invalid page cursor'); url.searchParams.set('pageCursor', cursor); }
 const response = await fetcher(url.href, { headers: { Authorization: `Token ${token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
 if (!response.ok) throw new Error(response.status === 429 ? 'Readwise rate limit reached. Wait a minute, then try again.' : 'Readwise could not be loaded. Check the server token and try again.');
 const body = await response.json() as { results: Record<string, unknown>[]; nextPageCursor: string | null };
 if (!Array.isArray(body.results) || (body.nextPageCursor !== null && typeof body.nextPageCursor !== 'string')) throw new Error('Unexpected Readwise response');
 return { items: body.results.map(v => candidate(v, timeZone)).filter((v): v is Candidate => !!v), cursor: body.nextPageCursor };
}
export function readwiseLedger(config: PublishingConfig, fetcher?: Parameters<typeof createGitHubStore>[1]) {
 const store = createGitHubStore(config, fetcher);
 async function read() {
  const file = await store.read(ledgerPath);
  const parsed = file ? JSON.parse(file.content) : { dismissed: [], imported: [] };
  const state: Ledger = { dismissed: parsed.dismissed, imported: parsed.imported };
  if (!Array.isArray(state.dismissed) || !Array.isArray(state.imported) || ![...state.dismissed, ...state.imported].every(validId)) throw new Error('Invalid Readwise ledger');
  return { file, state };
 }
 return {
  read,
  async add(kind: keyof Ledger, ids: string[]) {
   if (!ids.length || !ids.every(validId)) throw new Error('Invalid Readwise IDs');
   for (let attempt = 0; attempt < 3; attempt++) {
    const { file, state } = await read();
    state[kind] = [...new Set([...state[kind], ...ids])].sort();
    try { await store.write(ledgerPath, JSON.stringify(state) + '\n', { sha: file?.sha, message: `Update Readwise ${kind} IDs` }); return; }
    catch (e) { if (!(e instanceof GitHubStoreError) || e.outcome !== 'conflict' || attempt === 2) throw e; }
   }
  }
 };
}
