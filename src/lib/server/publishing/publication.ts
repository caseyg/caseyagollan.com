import { renderPostDetails } from '../../utils/post-details';
import { fromHtml } from 'hast-util-from-html';
import type { Nodes } from 'hast';
import type { Post } from '../../posts-types';
import { getPostPermalink } from '../../posts-types';
import { renderContentSync } from '../../utils/renderContent';
import { isPublicPost } from '../parse-post';
import { storedPhotoPosts, storedThread } from './syndication-thread';
import { documentRkey, isStandardDocument } from '../../standard-site';

/** What a Standard.site document record says about an article (see `standard-site.ts`). */
export interface StandardDocument {
 rkey: string;
 /** The page's path, joined to the publication URL. */
 path: string;
 title: string;
 description?: string;
 tags?: string[];
 publishedAt: string;
 updatedAt?: string;
 /** The article's Bluesky post, once it has one, so readers can find the conversation. */
 bskyPost?: string;
}

export interface Publication {
 url: string;
 revision: string;
 targets: string[];
 text: string;
 title?: string;
 published: string;
 syndicateTo: string[];
 sourcePath?: string;
 /** Addresses the post had before its slug changed. They redirect to `url`. */
 previousUrls?: string[];
 /** Photos attached to the post, with their alt text and the thread post each goes on, for social copies. */
 photos?: { url: string; alt: string; post?: number }[];
 /** The social copy as a thread of posts, from the post's `syndication-thread`. */
 thread?: string[];
 /** Articles only: the post's Standard.site document. */
 document?: StandardDocument;
}
const CANONICAL = 'https://caseyagollan.com';

/** A content revision excludes delivery bookkeeping so recording a result is not a new send. */
export async function publicationRevision(post: Post): Promise<string> {
 const structured = Object.fromEntries(['like-of', 'repost-of', 'rsvp', 'location', 'start', 'end', 'slides', 'slides-embed', 'video-link', 'video-embed', 'conference', 'item', 'rating', 'best', 'worst', 'itinerary', 'ate', 'drank'].filter(key => post.properties?.[key] !== undefined).map(key => [key, post.properties![key]]));
 const state = JSON.stringify({
  ...(Object.keys(structured).length ? { structured } : {}),
  ...(post.microformatType && post.microformatType !== 'h-entry' ? { microformatType: post.microformatType } : {}),
  ...(post.channel ? { channel: post.channel } : {}),
  slug: post.slug, type: post.type, date: post.date, title: post.title ?? null,
  html: renderContentSync(post.content, post.contentFormat), summary: post.summary ?? null,
  category: post.category ?? null, photo: post.photo ?? [], video: post.video ?? [],
  bookmarkOf: post.bookmarkOf ?? null, inReplyTo: post.inReplyTo ?? null,
  draft: !!post.draft, postStatus: post.postStatus ?? 'published',
  visibility: post.visibility ?? 'public', deleted: !!post.deleted
 });
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
 return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

const iso = (value?: string) => { const time = value ? Date.parse(value) : NaN; return Number.isFinite(time) ? new Date(time).toISOString() : undefined; };
/** A description for cards: the summary, or the opening of the text cut at a word. */
function excerpt(text: string, limit = 300): string {
 const flat = text.replace(/\s+/g, ' ').trim();
 if (flat.length <= limit) return flat;
 const cut = flat.slice(0, limit); const space = cut.lastIndexOf(' ');
 return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}
export function standardDocument(post: Post, text: string): StandardDocument | undefined {
 if (!isStandardDocument(post)) return;
 const tags = [post.category ?? []].flat().map(tag => String(tag).replace(/^#/, '').trim()).filter(Boolean);
 const description = post.summary?.trim() ? post.summary.replace(/\s+/g, ' ').trim() : text ? excerpt(text) : '';
 const bskyPost = post.syndication?.find(url => url.startsWith('https://bsky.app/'));
 const updatedAt = iso(post.updated);
 return {
  rkey: documentRkey(post), path: getPostPermalink(post), title: post.title!.trim(), publishedAt: iso(post.date)!,
  ...(description ? { description } : {}), ...(tags.length ? { tags } : {}), ...(updatedAt ? { updatedAt } : {}), ...(bskyPost ? { bskyPost } : {})
 };
}

export async function publicationForPost(post: Post, origin = CANONICAL): Promise<Publication> {
 const site = new URL(origin).origin;
 const tree = fromHtml(renderContentSync(post.content, post.contentFormat) + renderPostDetails({ ...post, socialSnapshots: undefined }), { fragment: true });
 const targets = new Set<string>();
 function addTarget(value: string) {
  if (targets.size >= 32) return;
  try {
   const url = new URL(value, site);
   if (url.protocol !== 'https:' || url.origin === site || url.username || url.password) return;
   url.hash = '';
   targets.add(url.href);
  } catch { /* A malformed relationship or link is not a delivery target. */ }
 }
 function read(node: Nodes): string {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element' && node.type !== 'root') return '';
  if (node.type === 'element' && node.tagName === 'a' && typeof node.properties.href === 'string') addTarget(node.properties.href);
  const text = node.children.map(read).join('');
  return node.type === 'element' && ['p', 'div', 'li', 'br', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'section', 'article', 'tr'].includes(node.tagName) ? `${text}\n` : text;
 }
 const text = read(tree).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
 const photoPosts = storedPhotoPosts(post.properties);
 const photos = (post.photo ?? []).map((photo, index) => ({ photo, post: photoPosts[index] ?? 0 })).filter(({ photo }) => /^https:\/\//.test(photo.url)).map(({ photo, post }) => ({ url: photo.url, alt: (photo.alt ?? '').replace(/\s+/g, ' ').trim(), ...(post ? { post } : {}) }));
 const thread = storedThread(post.properties);
 const document = standardDocument(post, text);
 if (post.inReplyTo) addTarget(post.inReplyTo);
 if (post.bookmarkOf) addTarget(post.bookmarkOf);
 return {
  url: new URL(getPostPermalink(post), site).href,
  revision: await publicationRevision(post), targets: [...targets], text,
  title: post.title, published: post.date, sourcePath: post.filePath,
  ...(photos.length ? { photos } : {}),
  ...(thread && thread.length > 1 ? { thread } : {}),
  ...(document ? { document } : {}),
  ...(post.previousUrls?.length ? { previousUrls: post.previousUrls.map(path => new URL(path, site).href) } : {}),
  // Imported activities may carry historical destination metadata. Never let a
  // polling import or later snapshot refresh trigger another automatic POSSE send.
  syndicateTo: post.properties?.['pesos-source']?.length ? [] : [...new Set(post.syndicationTargets ?? [])]
 };
}

export async function createPublicationManifest(posts: Post[], origin = CANONICAL): Promise<{ version: 1; publications: Publication[] }> {
 const visible = posts.filter(post => !post.draft && isPublicPost(post) && Number.isFinite(Date.parse(post.date)));
 return { version: 1, publications: await Promise.all(visible.map(post => publicationForPost(post, origin))) };
}
