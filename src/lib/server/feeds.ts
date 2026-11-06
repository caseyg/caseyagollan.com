import type { MediaItem, Post } from '../posts-types';
import { getPostPermalink } from '../posts-types';
import { isPublicPost } from './parse-post';
import { renderContentSync } from '../utils/renderContent';

const SITE = 'https://caseyagollan.com';
const TITLE = 'Casey Gollan';
const DESCRIPTION = 'Posts by Casey Gollan';
const EPOCH = '1970-01-01T00:00:00.000Z';
// XML 1.0 permits tabs, CR and LF, but excludes other controls and lone surrogates.
function clean(value: string): string {
 return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '');
}
function xml(value: string): string {
 return clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function safeUrl(value: string): string | undefined {
 try {
  const url = new URL(value, SITE);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
  return url.href;
 } catch { return; }
}
function mime(media: MediaItem): string | undefined {
 if (media.type && /^(audio|video|image)\/[a-z0-9.+-]+$/i.test(media.type)) return media.type;
 const ext = media.url.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
 return ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', ogg: 'audio/ogg', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' } as Record<string, string>)[ext || ''];
}
function entries(posts: Post[], limit: number) {
 return posts.filter(post => !post.draft && isPublicPost(post) && Number.isFinite(Date.parse(post.date)))
  .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  .slice(0, Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 50)
  .map(post => {
   const url = `${SITE}${getPostPermalink(post)}`;
   const attachments = [...(post.video || []), ...(post.photo || [])].flatMap(media => {
    const url = safeUrl(media.url), type = mime(media);
    return url && type ? [{ url, mime_type: type }] : [];
   });
   const photos = (post.photo || []).map(media => {
    const url = safeUrl(media.url);
    return url ? `<img src="${xml(url)}" alt="${xml(media.alt || '')}">` : '';
   }).join('');
   const videos = (post.video || []).map(media => {
    const url = safeUrl(media.url);
    return url ? `<video controls src="${xml(url)}"><a href="${xml(url)}">Video</a></video>` : '';
   }).join('');
   const publishedTime = Date.parse(post.date);
   const updatedTime = post.updated ? Date.parse(post.updated) : NaN;
   const modified = Number.isFinite(updatedTime) && updatedTime >= publishedTime ? new Date(updatedTime).toISOString() : undefined;
   return { post, url, modified, updated: modified ?? new Date(publishedTime).toISOString(), date: new Date(post.date).toISOString(), html: clean(renderContentSync(post.content, post.contentFormat) + photos + videos), attachments };
  });
}

function latestUpdated(items: ReturnType<typeof entries>): string {
 return items.length ? new Date(Math.max(...items.map(item => Date.parse(item.updated)))).toISOString() : EPOCH;
}

export function serializeRss(posts: Post[], limit = 50): string {
 const items = entries(posts, limit);
 const updated = latestUpdated(items);
 return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${TITLE}</title><link>${SITE}/</link><description>${DESCRIPTION}</description><language>en</language><atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/><lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>${items.map(({ post, url, date, html, attachments }) => `<item><guid isPermaLink="true">${xml(url)}</guid><link>${xml(url)}</link>${post.title ? `<title>${xml(post.title)}</title>` : ''}<dc:creator>${TITLE}</dc:creator><pubDate>${new Date(date).toUTCString()}</pubDate>${post.summary ? `<description>${xml(post.summary)}</description>` : ''}<content:encoded>${xml(html)}</content:encoded>${attachments.slice(0, 1).map(a => `<enclosure url="${xml(a.url)}" type="${xml(a.mime_type)}" length="0"/>`).join('')}</item>`).join('')}</channel></rss>\n`;
}

export function serializeAtom(posts: Post[], limit = 50): string {
 const items = entries(posts, limit);
 return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><id>${SITE}/</id><title>${TITLE}</title><subtitle>${DESCRIPTION}</subtitle><link href="${SITE}/"/><link href="${SITE}/atom.xml" rel="self" type="application/atom+xml"/><updated>${latestUpdated(items)}</updated><author><name>${TITLE}</name><uri>${SITE}/</uri></author>${items.map(({ post, url, date, updated, html, attachments }) => `<entry><id>${xml(url)}</id><title>${xml(post.title || post.summary || `${post.type} on ${post.date.slice(0, 10)}`)}</title><link href="${xml(url)}"/><published>${date}</published><updated>${updated}</updated>${post.summary ? `<summary>${xml(post.summary)}</summary>` : ''}<content type="html">${xml(html)}</content>${attachments.map(a => `<link rel="enclosure" href="${xml(a.url)}" type="${xml(a.mime_type)}"/>`).join('')}</entry>`).join('')}</feed>\n`;
}

export function serializeJsonFeed(posts: Post[], limit = 50): string {
 return JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: TITLE, home_page_url: `${SITE}/`, feed_url: `${SITE}/feed.json`, description: DESCRIPTION, language: 'en', authors: [{ name: TITLE, url: `${SITE}/` }], items: entries(posts, limit).map(({ post, url, date, modified, html, attachments }) => ({ id: url, url, title: post.title, summary: post.summary, content_html: html, date_published: date, date_modified: modified, tags: post.category ? (Array.isArray(post.category) ? post.category : [post.category]) : undefined, attachments: attachments.length ? attachments : undefined })) }, null, 2) + '\n';
}
