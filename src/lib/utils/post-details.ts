import type { Post } from '../posts-types';
import { renderLinkPreview, renderSocialSnapshot, type SocialSnapshot } from '../social-snapshots';
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
/** Recognizable public handles remain useful when an original was deleted. */
function replyUsername(value: string): string {
 try {
  const url = new URL(value);
  const blue = url.hostname === 'bsky.app' && url.pathname.match(/^\/profile\/([^/]+)\/post\/[^/]+\/?$/);
  if (blue && !blue[1].startsWith('did:')) return `@${decodeURIComponent(blue[1])}`;
  const mastodon = url.pathname.match(/^\/@([^/]+)\/\d+\/?$/) ?? url.pathname.match(/^\/users\/([^/]+)\/statuses\/\d+\/?$/);
  if (mastodon) { const name = decodeURIComponent(mastodon[1]); return `@${name.includes('@') ? name : `${name}@${url.hostname}`}`; }
 } catch { /* Unrecognized targets keep their original label. */ }
 return value;
}
function time(value: string, field: string): string {
 return value ? `<time class="dt-${field}" datetime="${escape(value)}">${escape(value.replace('T', ' '))}</time>` : '';
}
function location(value: unknown, property = 'p-location'): string {
 if (typeof value === 'string') {
  if (value.startsWith('geo:')) {
   const coords = value.match(/^geo:([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:;u=\d+(?:\.\d+)?)?$/);
   if (coords && Math.abs(Number(coords[1])) <= 90 && Math.abs(Number(coords[2])) <= 180) return `<span class="${property} h-geo"><span class="p-latitude">${escape(coords[1])}</span>, <span class="p-longitude">${escape(coords[2])}</span></span>`;
  }
  return `<span class="${property}">${link(value, value, `u-${property.slice(2)}`)}</span>`;
 }
 const p = properties(value);
 const name = text(p, 'name'), url = text(p, 'url');
 const fields = ['street-address', 'locality', 'region', 'country-name', 'latitude', 'longitude'].map(key => text(p, key) ? `<span class="p-${key}">${escape(text(p, key))}</span>` : '').filter(Boolean);
 return `<span class="${property} h-card"><span class="p-name">${url ? link(url, name || url, 'u-url') : escape(name)}</span>${fields.length ? ` · ${fields.join(', ')}` : ''}</span>`;
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
/** A cited work: a URL, or an h-cite with a name, author and address. `rel` is the property, e.g. u-read-of. */
function citation(value: unknown, property: string): string {
 if (typeof value === 'string') return `<cite>${link(value, replyUsername(value) === value ? value.replace(/^https?:\/\/(www\.)?/, '') : replyUsername(value), property)}</cite>`;
 const p = properties(value);
 const name = text(p, 'name') || text(p, 'url') || text(p, 'uid');
 const url = text(p, 'url');
 const author = (p.author ?? []).map(entry => typeof entry === 'string' ? entry : text(properties(entry), 'name')).filter(Boolean);
 const title = url ? link(url, name, 'u-url p-name') : `<span class="p-name">${escape(name)}</span>`;
 return `<cite class="${property.replace(/^u-/, 'p-')} h-cite">${title}${author.length ? ` by ${author.map(name => `<span class="p-author">${escape(name)}</span>`).join(', ')}` : ''}</cite>`;
}
const RSVP_LABELS: Record<string, string> = { yes: 'Going', no: 'Not going', maybe: 'Maybe going', interested: 'Interested' };
const READ_LABELS: Record<string, string> = { 'to-read': 'Want to read', reading: 'Started reading', finished: 'Finished reading' };
/** Consumed and experienced things: reads, watches, listens, plays and jams. */
const ACTIVITIES: [string, string][] = [['read-of', 'Read'], ['watch-of', 'Watched'], ['listen-of', 'Listened to'], ['play-of', 'Played'], ['jam-of', 'Jamming to']];
/** ISO 8601 durations such as PT1H5M, said the way people say them. */
export function durationLabel(value: string): string {
 const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
 if (!match || !match.slice(1).some(Boolean)) return value;
 const [, days, hours, minutes, seconds] = match;
 return [[days, 'd'], [hours, 'h'], [minutes, 'min'], [seconds, 's']].filter(([amount]) => amount).map(([amount, unit]) => `${amount} ${unit}`).join(' ');
}
function exercise(value: unknown): string {
 const p = properties(value);
 const activity = text(p, 'activity');
 const parts = [activity ? `<span class="p-activity">${escape(activity.charAt(0).toUpperCase() + activity.slice(1))}</span>` : ''];
 if (text(p, 'distance')) parts.push(`<span class="p-distance">${escape(text(p, 'distance'))}</span>`);
 if (text(p, 'duration')) parts.push(`<data class="p-duration" value="${escape(text(p, 'duration'))}">${escape(durationLabel(text(p, 'duration')))}</data>`);
 return `<p class="p-exercise h-exercise">${parts.filter(Boolean).join(' · ')}</p>`;
}
function address(p: Properties): string {
 const parts = ['street-address', 'locality', 'region', 'postal-code', 'country-name'].filter(key => text(p, key)).map(key => `<span class="p-${key}">${escape(text(p, key))}</span>`);
 return parts.length ? `<p class="p-adr h-adr">${parts.join(', ')}</p>` : '';
}
export interface PostAction {
 /** Past-tense phrase that completes "Casey ___ @someone", e.g. "replied to". */
 verb: string;
 /** The posts acted on, labelled by author handle where one is known. */
 targets: { url: string; label: string; classes: string }[];
}
function safeUrl(value: unknown): value is string {
 if (typeof value !== 'string') return false;
 try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
function targetLabel(post: Post, url: string): string {
 const snapshot = post.socialSnapshots?.find(snapshot => snapshot.url === url);
 const label = snapshot?.author.handle || snapshot?.author.name || replyUsername(url);
 return label === url ? new URL(url).hostname.replace(/^www\./, '') : label;
}
/**
 * What a reply, like or repost acts on, as data. The site states this once, in the post's
 * meta line; feeds keep the sentence form from renderPostDetails.
 */
export function getPostAction(post: Post): PostAction | undefined {
 const p = post.properties ?? {};
 const reply = post.inReplyTo || text(p, 'in-reply-to');
 if (safeUrl(reply)) return { verb: post.type === 'issue' ? 'opened an issue on' : post.type === 'rsvp' ? 'RSVPed to' : 'replied to', targets: [{ url: reply, label: targetLabel(post, reply), classes: 'u-in-reply-to' }] };
 const reactions = new Map<string, string[]>();
 const kinds = new Set<string>(post.indexActivities?.map(activity => activity.type) ?? []);
 for (const [key, kind] of [['like-of', 'like'], ['repost-of', 'repost']]) for (const value of p[key] ?? []) if (safeUrl(value)) {
  reactions.set(value, [...(reactions.get(value) ?? []), `u-${key}`]);
  if (!post.indexActivities) kinds.add(kind);
 }
 if (!kinds.size) return undefined;
 const verb = kinds.has('like') ? kinds.has('repost') ? 'liked and reposted' : 'liked' : 'reposted';
 if (post.indexActivities) {
  const url = post.socialSnapshots?.[0]?.url ?? post.indexActivities[0].target ?? [...reactions.keys()][0];
  if (!safeUrl(url)) return undefined;
  return { verb, targets: [{ url, label: targetLabel(post, url), classes: reactions.size === 1 ? [...reactions.values()][0].join(' ') : '' }] };
 }
 return { verb, targets: [...reactions].map(([url, classes]) => ({ url, label: targetLabel(post, url), classes: classes.join(' ') })) };
}
/** Shared semantic HTML for archive cards, permalinks, feeds and delivery text. */
export function renderPostQuotations(post: Post): string {
 return (post.properties?.['quotation-of']??[]).slice(0,8).map(value=>{
  const saved=post.socialSnapshots?.find(s=>s.url===value);
  if (saved) return renderSocialSnapshot(saved);
  if (typeof value==='string') return `<p>Quoting ${link(value,replyUsername(value)===value?value:`${replyUsername(value)}’s post`,'u-quotation-of')}</p>`;
  // A quoted passage: its words, then who said it and where.
  const p=properties(value), quoted=(p.content??[]).map(entry=>typeof entry==='string'?entry:String((entry as {value?:unknown})?.value??'')).filter(Boolean);
  const source=citation(value,'u-quotation-of');
  return quoted.length?`<blockquote class="p-quotation-of h-cite"><p class="p-content">${escape(quoted.join(' '))}</p><footer>— ${source.replace(/^<cite class="p-quotation-of h-cite">/,'<cite>')}</footer></blockquote>`:`<p>Quoting ${source}</p>`;
 }).join('');
}
/** Cards for links the post itself shares; the link stays in the text, the card shows what it is. */
export function renderLinkPreviews(post: Post): string {
 return sanitizePublishingHtml((post.linkPreviews ?? []).map(renderLinkPreview).join(''));
}
export function renderReplyLabel(post: Post): string {
 const reply = post.inReplyTo || text(post.properties ?? {}, 'in-reply-to');
 if (!reply) return '';
 const snapshot = post.socialSnapshots?.find(snapshot => snapshot.url === reply);
 return sanitizePublishingHtml(`<p>In reply to ${link(reply, snapshot?.author.handle || snapshot?.author.name || replyUsername(reply), 'u-in-reply-to')}</p>`);
}
/** `omitSource` drops the context post's outbound link: on the site the reply's own card carries the links out. */
export function renderReplyContext(post: Post, options: {omitLabel?: boolean; omitSource?: boolean} = {}): string {
 const reply = post.inReplyTo || text(post.properties ?? {}, 'in-reply-to');
 if (!reply) return '';
 const snapshot = post.socialSnapshots?.find(snapshot => snapshot.url === reply);
 if (options.omitLabel && !snapshot) return '';
 return sanitizePublishingHtml(`<div class="social-reply-context">${options.omitLabel ? '' : renderReplyLabel(post)}${snapshot ? renderSocialSnapshot(snapshot, {omitSource: options.omitSource}) : ''}</div>`);
}
/** The saved posts renderPostDetails shows (what was liked, reposted or replied to), for pages that draw them as components. */
export function postDetailSnapshots(post: Post): SocialSnapshot[] {
 const p = post.properties ?? {};
 const urls = post.indexActivities ? [post.socialSnapshots?.[0]?.url] : [...new Set([...(p['like-of'] ?? []), ...(p['repost-of'] ?? [])])];
 const reply = post.inReplyTo || text(p, 'in-reply-to');
 const found = [...urls, reply].map(url => typeof url === 'string' && url ? post.socialSnapshots?.find(s => s.url === url) : undefined).filter((s): s is SocialSnapshot => !!s);
 return [...new Set(found)];
}
/** `omitSnapshots` leaves out the saved posts that postDetailSnapshots returns, and the reply label when its post is among them. */
export function renderPostDetails(post: Post, options:{omitQuotations?:boolean;omitReply?:boolean;omitReactionLabel?:boolean;omitLinkPreviews?:boolean;omitSnapshots?:boolean}={}): string {
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
  if (!options.omitReactionLabel) html += `<p>${label} ${link(target,snapshot ? 'post' : target,classes)}</p>`;
  if (snapshot && !options.omitSnapshots) html += renderSocialSnapshot(snapshot);
 } else for (const [value,reaction] of reactions) {
  const snapshot = post.socialSnapshots?.find(snapshot => snapshot.url === value);
  const label = reaction.labels.join(' and ').replace('and Reposted','and reposted');
  if (!options.omitReactionLabel) html += `<p>${label} ${link(value, snapshot ? 'post' : value, reaction.classes.join(' '))}</p>`;
  if (snapshot && !options.omitSnapshots) html += renderSocialSnapshot(snapshot);
 }
 if (!options.omitReply && !options.omitSnapshots) html += renderReplyContext(post);
 else if (!options.omitReply && !post.socialSnapshots?.some(s => s.url === (post.inReplyTo || text(p, 'in-reply-to')))) html += renderReplyLabel(post);
 if (p.rsvp) html += `<p><data class="p-rsvp" value="${escape(text(p, 'rsvp'))}">${escape(RSVP_LABELS[text(p, 'rsvp')] ?? text(p, 'rsvp'))}</data></p>`;
 for (const value of p.checkin ?? []) html += `<p>Checked in at ${location(value, 'p-checkin')}</p>`;
 if (post.microformatType === 'h-card') {
  html += address(p);
  for (const value of p.url ?? []) if (typeof value === 'string') html += `<p>${link(value, value.replace(/^https?:\/\/(www\.)?/, ''), 'u-url')}</p>`;
  if (text(p, 'latitude') && text(p, 'longitude')) html += `<p class="h-geo"><span class="p-latitude">${escape(text(p, 'latitude'))}</span>, <span class="p-longitude">${escape(text(p, 'longitude'))}</span></p>`;
  for (const value of p.note ?? []) html += `<p class="p-note">${escape(value)}</p>`;
 }
 for (const [key, verb] of ACTIVITIES) for (const value of p[key] ?? []) html += `<p>${key === 'read-of' ? READ_LABELS[text(p, 'read-status')] ?? verb : verb} ${citation(value, `u-${key}`)}</p>`;
 for (const value of p.exercise ?? []) html += exercise(value);
 if (p.children?.length) html += `<ul class="collection">${p.children.slice(0, 100).map(value => `<li>${citation(value, 'u-children').replace(/class="p-children h-cite"/, 'class="h-cite"')}</li>`).join('')}</ul>`;
 if (post.microformatType === 'h-recipe') {
  const facts = [text(p, 'yield') && `Makes <span class="p-yield">${escape(text(p, 'yield'))}</span>`, text(p, 'duration') && `Takes <data class="dt-duration" value="${escape(text(p, 'duration'))}">${escape(durationLabel(text(p, 'duration')))}</data>`].filter(Boolean);
  if (facts.length) html += `<p>${facts.join(' · ')}</p>`;
  if (p.ingredient?.length) html += `<h3>Ingredients</h3><ul class="ingredients">${p.ingredient.map(value => `<li class="p-ingredient">${escape(value)}</li>`).join('')}</ul>`;
 }
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
 if(!options.omitLinkPreviews)html+=(post.linkPreviews ?? []).map(renderLinkPreview).join('');
 if(!options.omitQuotations)html+=renderPostQuotations(post);
 return sanitizePublishingHtml(html);
}
