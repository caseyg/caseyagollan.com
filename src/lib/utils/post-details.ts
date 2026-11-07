import type { Post } from '../posts-types';
import { renderSocialSnapshot } from '../social-snapshots';
import { sanitizePublishingHtml } from './sanitizeHtml';
import { renderContentSync } from './renderContent';

type Properties = Record<string, unknown[]>;
const escape = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const text = (p: Properties, key: string): string => typeof p[key]?.[0] === 'string' || typeof p[key]?.[0] === 'number' ? String(p[key][0]) : '';
function properties(value: unknown): Properties {
 if (!value || typeof value !== 'object') return {};
 const p = (value as { properties?: unknown }).properties;
 return p && typeof p === 'object' && !Array.isArray(p) ? p as Properties : {};
}
function link(url: string, label: string, classes = ''): string {
 try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return escape(label); } catch { return escape(label); }
 return `<a class="${classes}" href="${escape(url)}">${escape(label)}</a>`;
}
function time(value: string, field: string): string {
 return value ? `<time class="dt-${field}" datetime="${escape(value)}">${escape(value.replace('T', ' '))}</time>` : '';
}
function location(value: unknown): string {
 if (typeof value === 'string') {
  if (value.startsWith('geo:')) {
   const coords = value.match(/^geo:([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:;u=\d+(?:\.\d+)?)?$/);
   if (coords && Math.abs(Number(coords[1])) <= 90 && Math.abs(Number(coords[2])) <= 180) return `<span class="p-location h-geo"><span class="p-latitude">${escape(coords[1])}</span>, <span class="p-longitude">${escape(coords[2])}</span></span>`;
  }
  return `<span class="p-location">${link(value, value, 'u-location')}</span>`;
 }
 const p = properties(value);
 const name = text(p, 'name'), url = text(p, 'url');
 const fields = ['locality', 'region', 'country-name', 'latitude', 'longitude'].map(key => text(p, key) ? `<span class="p-${key}">${escape(text(p, key))}</span>` : '').filter(Boolean);
 return `<span class="p-location h-card"><span class="p-name">${url ? link(url, name || url, 'u-url') : escape(name)}</span>${fields.length ? ` · ${fields.join(', ')}` : ''}</span>`;
}
function event(p: Properties, depth = 0): string {
 let html = `<p class="event-time">${time(text(p, 'start'), 'start')}${p.end ? ` – ${time(text(p, 'end'), 'end')}` : ''}</p>`;
 for (const value of p.location ?? []) html += `<p>${location(value)}</p>`;
 if (depth < 3) for (const value of p.conference ?? []) {
  const conference = properties(value);
  html += `<section class="p-conference h-event"><p class="p-name">${text(conference,'url') ? link(text(conference,'url'), text(conference,'name'), 'u-url') : escape(text(conference,'name'))}</p>${event(conference, depth + 1)}`;
  for (const content of conference.content ?? []) html += `<div class="e-content">${typeof content === 'string' ? renderContentSync(content, 'text') : sanitizePublishingHtml(String((content as {html?: unknown})?.html ?? ''))}</div>`;
  html += '</section>';
 }
 for (const [key,label] of [['slides','Slides'],['video-link','Video']]) for (const value of p[key] ?? []) if (typeof value === 'string') html += `<p>${link(value, label, `u-${key}`)}</p>`;
 for (const key of ['slides-embed','video-embed']) for (const value of p[key] ?? []) if (typeof value === 'string') html += `<div class="presentation-embed">${sanitizePublishingHtml(value)}</div>`;
 return html;
}
/** Shared semantic HTML for archive cards, permalinks, feeds and delivery text. */
export function renderPostQuotations(post: Post): string {
 return (post.properties?.['quotation-of']??[]).slice(0,8).map(value=>{const saved=post.socialSnapshots?.find(s=>s.url===value);return saved?renderSocialSnapshot(saved):'';}).join('');
}
export function renderPostDetails(post: Post, options:{omitQuotations?:boolean}={}): string {
 const p = post.properties ?? {};
 let html = '';
 const reactions = new Map<string, {labels: string[]; classes: string[]}>();
 for (const [key,label] of [['like-of','Liked'],['repost-of','Reposted']]) for (const value of p[key] ?? []) if (typeof value === 'string') {
  const reaction = reactions.get(value) ?? {labels:[],classes:[]};
  if (!reaction.labels.includes(label)) { reaction.labels.push(label); reaction.classes.push(`u-${key}`); }
  reactions.set(value,reaction);
 }
 if (post.indexActivities) {
  const snapshot = post.socialSnapshots?.[0];
  const target = snapshot?.url ?? post.indexActivities[0].target ?? [...reactions.keys()][0];
  const kinds = new Set(post.indexActivities.map(activity=>activity.type));
  const label = kinds.has('like') ? kinds.has('repost') ? 'Liked and reposted' : 'Liked' : 'Reposted';
  const classes = [...reactions.keys()].length === 1 ? [...reactions.values()][0].classes.join(' ') : '';
  html += `<p>${label} ${link(target,snapshot ? 'post' : target,classes)}</p>`;
  if (snapshot) html += renderSocialSnapshot(snapshot);
 } else for (const [value,reaction] of reactions) {
  const snapshot = post.socialSnapshots?.find(snapshot => snapshot.url === value);
  const label = reaction.labels.join(' and ').replace('and Reposted','and reposted');
  html += `<p>${label} ${link(value, snapshot ? 'post' : value, reaction.classes.join(' '))}</p>`;
  if (snapshot) html += renderSocialSnapshot(snapshot);
 }
 const reply = post.inReplyTo || text(p, 'in-reply-to');
 if (reply) {
  const snapshot = post.socialSnapshots?.find(snapshot => snapshot.url === reply);
  html += `<p>In reply to ${link(reply, snapshot ? 'post' : reply, 'u-in-reply-to')}</p>`;
  if (snapshot) html += renderSocialSnapshot(snapshot);
 }
 if (p.rsvp) html += `<p>RSVP: <span class="p-rsvp">${escape(text(p, 'rsvp'))}</span></p>`;
 if (post.type === 'event' || post.microformatType === 'h-event') html += event(p);
 else for (const value of p.location ?? []) html += `<p>${location(value)}</p>`;
 for (const item of p.item ?? []) {
  const product = properties(item), name = text(product,'name'), url = text(product,'url');
  html += `<p class="p-item h-product"><span class="p-name">${url ? link(url, name || url, 'u-url') : escape(name)}</span></p>`;
 }
 if (p.rating) html += `<p>Rating: <span class="p-rating">${escape(text(p,'rating'))}</span>${p.best ? ` / <span class="p-best">${escape(text(p,'best'))}</span>` : ''}${p.worst ? ` (minimum <span class="p-worst">${escape(text(p,'worst'))}</span>)` : ''}</p>`;
 for (const value of p.itinerary ?? []) {
  const leg = properties(value);
  html += `<section class="p-itinerary h-leg"><p>${['transit-type','operator','number'].map(key => text(leg,key) ? `<span class="p-${key}">${escape(text(leg,key))}</span>` : '').filter(Boolean).join(' ')} · <span class="p-origin">${escape(text(leg,'origin'))}</span> → <span class="p-destination">${escape(text(leg,'destination'))}</span></p><p>${time(text(leg,'departure'),'departure')} – ${time(text(leg,'arrival'),'arrival')}</p></section>`;
 }
 for (const [key,label] of [['ate','Ate'],['drank','Drank']]) for (const value of p[key] ?? []) html += `<p>${label}: <span class="p-${key} h-food"><span class="p-name">${escape(text(properties(value),'name'))}</span></span></p>`;
 if(!options.omitQuotations)html+=renderPostQuotations(post);
 return sanitizePublishingHtml(html);
}
