import { fromHtml } from 'hast-util-from-html';
import type { Properties } from '../document';
import type { Activity } from './providers';

function body(properties: Properties): string {
 const value = properties.content?.[0];
 let text = typeof value === 'string' ? value : '';
 if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.html === 'string') {
  const visit = (node: any): string => {
   if (node.type === 'text') return node.value;
   const children = (node.children ?? []).map(visit).join('');
   // Preserve link destinations, including Mastodon's visually shortened links.
   if (node.tagName === 'a' && typeof node.properties?.href === 'string') {
    const href = node.properties.href;
    return /^(https?:\/\/|www\.)/.test(children.trim()) || href.includes(children.trim()) ? href : `${children} ${href}`;
   }
   return ['p','div','br','li'].includes(node.tagName) ? ` ${children} ` : children;
  };
  text = visit(fromHtml(value.html,{fragment:true}));
 }
 return text.normalize('NFC').replace(/\s+/g,' ').trim();
}

/** Strong evidence only: exact substantial text, different networks, within a day.
 * Reactions stay separate records; matching a shared article is an index concern.
 * Re-encoded media and short/repeated captions require manual review. */
export function duplicateOriginal<T extends {properties: Properties}>(activity: Activity, entries: T[]): T | undefined {
 if (activity.kind !== 'post') return;
 const p = activity.properties;
 const text = body(p);
 if (text.length < 32 || ['photo','video','audio','in-reply-to'].some(key=>p[key]?.length)) return;
 const matches = entries.filter(entry=>{
  const other = entry.properties;
  if (!other['pesos-source']?.length || other.deleted?.includes('true') ||
   ['like-of','repost-of','photo','video','audio','in-reply-to'].some(key=>other[key]?.length)) return false;
  const dates = other.published;
  const time = typeof dates?.[0] === 'string' ? Date.parse(dates[0]) : NaN;
  if (!Number.isFinite(time) || Math.abs(time-Date.parse(activity.published)) > 24*60*60_000) return false;
  // Never collapse repeated posts on the same network using text similarity.
  const sources = other['pesos-source'].filter((s):s is string=>typeof s === 'string');
  if (sources.some(source=>activity.service === 'bluesky' ? source.startsWith('at://') : source.startsWith('mastodon:'))) return false;
  return body(other) === text && JSON.stringify(other.summary ?? []) === JSON.stringify(p.summary ?? []);
 });
 // Ambiguous repeats need review, not an arbitrary winner.
 return matches.length === 1 ? matches[0] : undefined;
}
