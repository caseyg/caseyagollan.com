import { getPostPermalink, type Post } from '$lib/posts-types';
import type { SocialSnapshot } from '$lib/social-snapshots';
import { getPostAction } from './post-details';

/** One post in a flattened conversation: someone else's saved post, or one of the site's own replies. */
export type ThreadEntry =
 | { kind: 'saved'; key: string; snapshot: SocialSnapshot; reactions: ThreadReaction[] }
 | { kind: 'link'; key: string; url: string; label: string; reactions: ThreadReaction[] }
 | { kind: 'own'; key: string; post: Post; replyTo?: { url: string; label: string } };
export interface ThreadReaction { type: 'like' | 'repost'; permalink: string; date: string }

const strings = (values: unknown[] | undefined): string[] => (values ?? []).filter((value): value is string => typeof value === 'string');

/** Every spelling one post can go by: its URLs, plus the record key Bluesky uses in both handle and DID links. */
function identities(...urls: (string | undefined)[]): string[] {
 const result = new Set<string>();
 for (const url of urls) {
  if (!url) continue;
  result.add(url.replace(/\/$/, ''));
  const bluesky = url.match(/^https:\/\/bsky\.app\/profile\/[^/]+\/post\/([a-zA-Z0-9]+)/) ?? url.match(/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)/);
  if (bluesky) result.add(`bluesky:${bluesky[1]}`);
 }
 return [...result];
}

/**
 * Flatten a rolled-up conversation into one chronological thread. Each saved parent post appears once,
 * before the first reply to it, and a reply that answers one of the site's own replies does not repeat it.
 */
export function buildThreadEntries(members: Post[]): ThreadEntry[] {
 const entries: ThreadEntry[] = [];
 const byIdentity = new Map<string, ThreadEntry>();
 const remember = (entry: ThreadEntry, keys: string[]) => { for (const key of keys) if (!byIdentity.has(key)) byIdentity.set(key, entry); };
 const find = (keys: string[]) => keys.map(key => byIdentity.get(key)).find(Boolean);

 for (const member of members) {
  const p = member.properties ?? {};
  const reply = member.type === 'reply' ? member.inReplyTo || strings(p['in-reply-to'])[0] : undefined;
  const reactions: [string, ThreadReaction['type']][] = member.type === 'reply' ? [] : [
   ...strings(p['like-of']).map(url => [url, 'like'] as [string, 'like']),
   ...strings(p['repost-of']).map(url => [url, 'repost'] as [string, 'repost'])
  ];
  if (member.indexActivities?.length && !reactions.length) {
   const target = member.socialSnapshots?.[0]?.url ?? member.indexActivities[0].target;
   if (target) for (const activity of member.indexActivities) reactions.push([target, activity.type]);
  }
  const action = getPostAction(member);
  const label = (url: string) => action?.targets.find(target => target.url === url)?.label ?? url;

  // Show what this member answers or reacts to, once.
  const targetEntry = (url: string): ThreadEntry | undefined => {
   const snapshot = member.socialSnapshots?.find(s => s.url === url || s.sourceUrl === url);
   const keys = identities(url, snapshot?.url, snapshot?.sourceUrl);
   const existing = find(keys);
   if (existing) { remember(existing, keys); return existing; }
   if (!snapshot && member.type === 'reply') return undefined;
   const entry: ThreadEntry = snapshot
    ? { kind: 'saved', key: `saved:${keys[0]}`, snapshot, reactions: [] }
    : { kind: 'link', key: `link:${keys[0]}`, url, label: label(url), reactions: [] };
   entries.push(entry);
   remember(entry, keys);
   return entry;
  };

  for (const [url, type] of reactions) {
   const entry = targetEntry(url);
   if (entry && entry.kind !== 'own' && !entry.reactions.some(r => r.type === type)) entry.reactions.push({ type, permalink: member.indexActivities?.find(a => a.type === type)?.permalink ?? getPostPermalink(member), date: member.date });
  }
  if (member.type !== 'reply') continue;

  const parent = reply ? targetEntry(reply) : undefined;
  const own: ThreadEntry = { kind: 'own', key: `own:${member.filePath}`, post: member, replyTo: reply && !parent ? { url: reply, label: label(reply) } : undefined };
  entries.push(own);
  remember(own, identities(...(member.syndication ?? []), ...strings(p['pesos-source'])));
 }
 return entries;
}
