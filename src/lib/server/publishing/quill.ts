import { POST_TYPE_PLURALS } from '../../posts-types';
import type { Json, Properties } from './document';
import { ProtocolError } from './auth';
import { sanitizePublishingHtml } from '../../utils/sanitizeHtml';

export const QUILL_TYPES = ['note', 'article', 'bookmark', 'like', 'repost', 'reply', 'photo', 'video', 'event', 'review', 'itinerary', 'food', 'drink'] as const;
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
  if (['name', 'summary', 'rsvp', 'p3k-content-type', 'slides', 'slides-embed', 'video-link', 'video-embed', 'start', 'end', 'transit-type', 'operator', 'number', 'origin', 'destination', 'departure', 'arrival', 'locality', 'region', 'country-name'].includes(key)) singleText(p, key);
  if (['like-of', 'repost-of', 'bookmark-of', 'in-reply-to', 'slides', 'video-link', 'url'].includes(key) && values.some(value => !http(value))) bad(`Invalid ${key} URL`);
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
  const types: Record<string,string> = { item: 'h-product', conference: 'h-event', itinerary: 'h-leg', ate: 'h-food', drank: 'h-food' };
  if (types[key]) for (const value of values) nested(value, types[key], depth);
 }
 if (p.rsvp && !['yes','no','maybe','interested'].includes(String(p.rsvp[0]))) bad('Invalid RSVP');
 if (p['p3k-content-type'] && p['p3k-content-type'][0] !== 'text/markdown') bad('Unsupported content type');
 if (p['p3k-content-type'] && p.content?.some(value => typeof value !== 'string')) bad('Markdown content must be text');
 if (root === 'h-event') { singleText(p, 'name', true); singleText(p, 'start', depth === 0); }
 if (root === 'h-product' || root === 'h-food') singleText(p, 'name', true);
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
export function postFolder(p: Properties, root: string): string {
 if (root === 'h-event') return 'events';
 if (root === 'h-review') return 'reviews';
 for (const [key, folder] of [['like-of','likes'],['repost-of','reposts'],['in-reply-to','replies'],['bookmark-of','bookmarks'],['itinerary','itineraries'],['ate','foods'],['drank','drinks'],['video','videos'],['photo','photos'],['name','articles']]) if (p[key]?.length) return folder;
 return 'notes';
}
