import { POST_TYPE_PLURALS } from '../../posts-types';
import type { Json, Properties } from './document';
import { ProtocolError } from './auth';
import { sanitizePublishingHtml } from '../../utils/sanitizeHtml';

export const QUILL_TYPES = ['note', 'article', 'bookmark', 'like', 'repost', 'quotation', 'reply', 'rsvp', 'photo', 'video', 'audio', 'event', 'checkin', 'venue', 'review', 'itinerary', 'food', 'drink', 'read', 'watch', 'listen', 'play', 'jam', 'collection', 'issue', 'exercise', 'recipe'] as const;
export type QuillType = (typeof QUILL_TYPES)[number];
/**
 * What q=config advertises for each type (the post-types extension): its microformat
 * root, the properties it uses and the ones it cannot do without.
 */
export const POST_TYPE_SPECS: Record<QuillType, { name: string; h: string; properties: string[]; required: string[] }> = {
 note: { name: 'Note', h: 'entry', properties: ['content', 'category', 'location', 'photo'], required: ['content'] },
 article: { name: 'Article', h: 'entry', properties: ['name', 'summary', 'content', 'category', 'photo'], required: ['name', 'content'] },
 bookmark: { name: 'Bookmark', h: 'entry', properties: ['bookmark-of', 'name', 'content', 'category'], required: ['bookmark-of'] },
 like: { name: 'Like', h: 'entry', properties: ['like-of', 'category'], required: ['like-of'] },
 repost: { name: 'Repost', h: 'entry', properties: ['repost-of', 'content', 'category'], required: ['repost-of'] },
 quotation: { name: 'Quotation', h: 'entry', properties: ['quotation-of', 'content', 'category'], required: ['quotation-of'] },
 reply: { name: 'Reply', h: 'entry', properties: ['in-reply-to', 'content', 'category', 'photo'], required: ['in-reply-to', 'content'] },
 rsvp: { name: 'RSVP', h: 'entry', properties: ['in-reply-to', 'rsvp', 'content'], required: ['in-reply-to', 'rsvp'] },
 photo: { name: 'Photo', h: 'entry', properties: ['photo', 'content', 'category', 'location'], required: ['photo'] },
 video: { name: 'Video', h: 'entry', properties: ['video', 'content', 'category'], required: ['video'] },
 audio: { name: 'Audio', h: 'entry', properties: ['audio', 'name', 'content', 'category'], required: ['audio'] },
 event: { name: 'Event', h: 'event', properties: ['name', 'start', 'end', 'location', 'content', 'category'], required: ['name', 'start'] },
 checkin: { name: 'Checkin', h: 'entry', properties: ['checkin', 'content', 'category', 'photo'], required: ['checkin'] },
 venue: { name: 'Venue', h: 'card', properties: ['name', 'url', 'street-address', 'locality', 'region', 'country-name', 'latitude', 'longitude', 'note'], required: ['name'] },
 review: { name: 'Review', h: 'review', properties: ['item', 'rating', 'best', 'worst', 'name', 'content', 'category'], required: ['item'] },
 itinerary: { name: 'Itinerary', h: 'entry', properties: ['itinerary', 'content'], required: ['itinerary'] },
 food: { name: 'Food', h: 'entry', properties: ['ate', 'content', 'photo'], required: ['ate'] },
 drink: { name: 'Drink', h: 'entry', properties: ['drank', 'content', 'photo'], required: ['drank'] },
 read: { name: 'Read', h: 'entry', properties: ['read-of', 'read-status', 'content', 'category'], required: ['read-of'] },
 watch: { name: 'Watch', h: 'entry', properties: ['watch-of', 'content', 'category'], required: ['watch-of'] },
 listen: { name: 'Listen', h: 'entry', properties: ['listen-of', 'content', 'category'], required: ['listen-of'] },
 play: { name: 'Play', h: 'entry', properties: ['play-of', 'content', 'category'], required: ['play-of'] },
 jam: { name: 'Jam', h: 'entry', properties: ['jam-of', 'content'], required: ['jam-of'] },
 collection: { name: 'Collection', h: 'entry', properties: ['name', 'children', 'content', 'category'], required: ['name', 'children'] },
 issue: { name: 'Issue', h: 'entry', properties: ['in-reply-to', 'name', 'content', 'category'], required: ['in-reply-to', 'name', 'content'] },
 exercise: { name: 'Exercise', h: 'entry', properties: ['exercise', 'content', 'category', 'photo'], required: ['exercise'] },
 recipe: { name: 'Recipe', h: 'recipe', properties: ['name', 'ingredient', 'yield', 'duration', 'content', 'photo', 'category'], required: ['name', 'ingredient'] }
};
/** Microformat roots a create may use. */
export const ROOT_TYPES = ['h-entry', 'h-event', 'h-review', 'h-recipe', 'h-card'];
/** Properties that point at a thing: a URL, or an h-cite describing it. */
export const CITATIONS = ['quotation-of', 'read-of', 'watch-of', 'listen-of', 'play-of', 'jam-of', 'children'];
export const channels = QUILL_TYPES.map(type => {
 const uid = POST_TYPE_PLURALS[type];
 return { uid, name: uid[0].toUpperCase() + uid.slice(1) };
});
const bad = (message: string): never => { throw new ProtocolError(400, 'invalid_request', message); };
export function http(value: unknown): value is string {
 if (typeof value !== 'string') return false;
 try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function date(value: unknown): boolean {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
 const day = new Date(`${value.slice(0,10)}T00:00:00Z`);
 return Number.isFinite(Date.parse(value)) && Number.isFinite(day.getTime()) && day.toISOString().slice(0,10) === value.slice(0,10);
}
function singleText(p: Properties, key: string, required = false) {
 const values = p[key];
 if (!values) { if (required) bad(`Missing ${key}`); return; }
 if (values.length !== 1 || typeof values[0] !== 'string' || (required && !values[0].trim())) bad(`Use one text value for ${key}`);
}
function nested(value: Json, type: string, depth: number): Properties {
 if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.type) || value.type.length !== 1 || value.type[0] !== type || !value.properties || typeof value.properties !== 'object' || Array.isArray(value.properties)) bad(`Expected ${type} with properties`);
 const properties = (value as { properties: Properties }).properties;
 validateQuill(properties, type, depth + 1);
 return properties;
}
/** Validate and sanitize both incoming properties and the fully merged document. */
export function validateQuill(p: Properties, root = 'h-entry', depth = 0): void {
 if (depth > 5) bad('Nested properties are too deep');
 for (const [key, values] of Object.entries(p)) {
  if (!Array.isArray(values)) bad('Property values must be arrays');
  if (key === 'weight') bad('Weight posts are not supported');
  if (key === 'visibility' && (values.length !== 1 || values[0] !== 'public')) bad('Private visibility is not supported');
  if (['name', 'summary', 'rsvp', 'read-status', 'activity', 'duration', 'distance', 'yield', 'street-address', 'postal-code', 'p3k-content-type', 'slides', 'slides-embed', 'video-link', 'video-embed', 'start', 'end', 'transit-type', 'operator', 'number', 'origin', 'destination', 'departure', 'arrival', 'locality', 'region', 'country-name'].includes(key)) singleText(p, key);
  if (['like-of', 'repost-of', 'bookmark-of', 'in-reply-to', 'slides', 'video-link'].includes(key) && values.some(value => !http(value))) bad(`Invalid ${key} URL`);
  if (['start', 'end', 'departure', 'arrival'].includes(key) && values.some(value => !date(value))) bad(`Invalid ${key} date`);
  if (['slides-embed', 'video-embed'].includes(key)) p[key] = values.map(value => sanitizePublishingHtml(value as string));
  if (key === 'content') for (const value of values) {
   if (typeof value === 'string') continue;
   if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || typeof value.html !== 'string') bad('Use text or HTML content');
   (value as { html: string }).html = sanitizePublishingHtml((value as { html: string }).html);
  }
  if (key === 'location') for (const value of values) {
   if (typeof value === 'string') {
    if (value.startsWith('geo:')) {
     const match = value.match(/^geo:([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:;u=\d+(?:\.\d+)?)?$/);
     if (!match || Math.abs(Number(match[1])) > 90 || Math.abs(Number(match[2])) > 180) bad('Invalid geo location');
    } else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !http(value)) bad('Invalid location URL');
   } else nested(value, 'h-card', depth);
  }
  if (['latitude', 'longitude'].includes(key) && (values.length !== 1 || !Number.isFinite(Number(values[0])) || !['number','string'].includes(typeof values[0]) || Math.abs(Number(values[0])) > (key === 'latitude' ? 90 : 180))) bad(`Invalid ${key}`);
  const types: Record<string,string> = { item: 'h-product', conference: 'h-event', itinerary: 'h-leg', ate: 'h-food', drank: 'h-food', exercise: 'h-exercise' };
  if (types[key]) for (const value of values) nested(value, types[key], depth);
  if (CITATIONS.includes(key)) for (const value of values) if (typeof value === 'string' ? !http(value) : (nested(value, 'h-cite', depth), false)) bad(`Invalid ${key} URL`);
  if (key === 'checkin') for (const value of values) if (typeof value === 'string' ? !http(value) : (nested(value, 'h-card', depth), false)) bad('Invalid checkin URL');
  if (key === 'author') for (const value of values) if (typeof value !== 'string') nested(value, 'h-card', depth);
  if (['ingredient', 'note'].includes(key) && values.some(value => typeof value !== 'string' || !value.trim())) bad(`Use text values for ${key}`);
 }
 if (p.url && p.url.some(value => !http(value))) bad('Invalid url URL');
 if (p.rsvp && !['yes','no','maybe','interested'].includes(String(p.rsvp[0]))) bad('Invalid RSVP');
 if (p['read-status'] && !['to-read','reading','finished'].includes(String(p['read-status'][0]))) bad('Use to-read, reading or finished for read-status');
 if (p['p3k-content-type'] && p['p3k-content-type'][0] !== 'text/markdown') bad('Unsupported content type');
 if (p['p3k-content-type'] && p.content?.some(value => typeof value !== 'string')) bad('Markdown content must be text');
 if (root === 'h-event') { singleText(p, 'name', true); singleText(p, 'start', depth === 0); }
 if (['h-product', 'h-food', 'h-recipe'].includes(root) || (root === 'h-card' && depth === 0)) singleText(p, 'name', true);
 if (root === 'h-cite' && !p.name && !p.url && !p.uid) bad('A citation needs a name or URL');
 if (root === 'h-exercise') singleText(p, 'activity', true);
 if (root === 'h-recipe' && depth === 0 && !p.ingredient?.length) bad('A recipe needs at least one ingredient');
 if (p.children && p.children.length > 100) bad('A collection holds at most 100 items');
 if (root === 'h-leg') for (const key of ['origin', 'destination', 'departure', 'arrival']) singleText(p, key, true);
 if (root === 'h-review') {
  if (!p.item || p.item.length !== 1) bad('A review needs one item');
  for (const key of ['rating','best','worst']) if (p[key] && (p[key].length !== 1 || typeof p[key][0] !== 'number' || !Number.isFinite(p[key][0]))) bad(`Invalid ${key}`);
  const rating = p.rating?.[0] as number | undefined, best = p.best?.[0] as number | undefined, worst = p.worst?.[0] as number | undefined;
  if ((best !== undefined && worst !== undefined && best <= worst) || (rating !== undefined && ((best !== undefined && rating > best) || (worst !== undefined && rating < worst)))) bad('Rating is outside the scale');
 }
 for (const [start, end] of [['start','end'],['departure','arrival']]) if (p[start] && p[end] && Date.parse(String(p[end][0])) < Date.parse(String(p[start][0]))) bad(`${end} precedes ${start}`);
}
export function channelValue(value: unknown): string | undefined {
 if (value === undefined) return;
 if (!Array.isArray(value) || value.length !== 1 || !channels.some(channel => channel.uid === value[0])) bad('Unknown channel');
 return (value as string[])[0];
}
/** Which content folder a new post goes in: Post Type Discovery, from the most specific property down. */
export function postFolder(p: Properties, root: string): string {
 const byRoot: Record<string, string> = { 'h-event': 'events', 'h-review': 'reviews', 'h-recipe': 'recipes', 'h-card': 'venues' };
 if (byRoot[root]) return byRoot[root];
 if (p.rsvp?.length && p['in-reply-to']?.length) return 'rsvps';
 if (p['in-reply-to']?.length && p.name?.length) return 'issues';
 for (const [key, folder] of [['checkin','checkins'],['like-of','likes'],['repost-of','reposts'],['quotation-of','quotations'],['in-reply-to','replies'],['bookmark-of','bookmarks'],['read-of','reads'],['watch-of','watches'],['listen-of','listens'],['play-of','plays'],['jam-of','jams'],['exercise','exercises'],['children','collections'],['itinerary','itineraries'],['ate','foods'],['drank','drinks'],['video','videos'],['audio','audio'],['photo','photos'],['name','articles']]) if (p[key]?.length) return folder;
 return 'notes';
}
