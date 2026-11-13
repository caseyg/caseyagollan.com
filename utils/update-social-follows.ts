import type { FollowedAccount } from '../src/lib/social-text';
const accounts: FollowedAccount[] = [];
async function json(url: string) {
 const response = await fetch(url);
 if (!response.ok) throw new Error(`Follow lookup failed: ${response.status}`);
 return response.json();
}
const actor = process.env.PUBLISHING_BLUESKY_IDENTIFIER;
const instance = process.env.PUBLISHING_MASTODON_INSTANCE;
const acct = process.env.MASTODON_ACCOUNT;
if (!actor || !instance || !acct) throw new Error('Set PUBLISHING_BLUESKY_IDENTIFIER, PUBLISHING_MASTODON_INSTANCE and MASTODON_ACCOUNT');
let cursor = '';
const cursors = new Set<string>();
do {
 const page = await json(`https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows?actor=${encodeURIComponent(actor)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
 for (const follow of page.follows) accounts.push({ service: 'bluesky', handle: follow.handle, name: follow.displayName || follow.handle });
 cursor = page.cursor || '';
 if (cursor && cursors.has(cursor)) throw new Error('Repeated Bluesky cursor');
 cursors.add(cursor);
} while (cursor);
const base = new URL(instance).origin;
const owner = await json(`${base}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`);
let next: string | null = `${base}/api/v1/accounts/${owner.id}/following?limit=80`;
const pages = new Set<string>();
while (next) {
 if (new URL(next).origin !== base || pages.has(next)) throw new Error('Invalid Mastodon pagination');
 pages.add(next);
 const response = await fetch(next);
 if (!response.ok) throw new Error(`Mastodon follows failed: ${response.status}`);
 for (const follow of await response.json()) accounts.push({ service: 'mastodon', handle: follow.acct.includes('@') ? follow.acct : `${follow.acct}@${new URL(base).host}`, name: follow.display_name || follow.acct });
 next = response.headers.get('link')?.match(/<([^>]+)>; rel="next"/)?.[1] ?? null;
}
await Bun.write(new URL('../src/lib/data/social-follows.json', import.meta.url), JSON.stringify({ updatedAt: new Date().toISOString(), accounts: accounts.sort((a,b) => a.handle.localeCompare(b.handle)) }, null, 2) + '\n');
