import { fromHtml } from 'hast-util-from-html';
import type { Nodes } from 'hast';
import type { Post } from '../../posts-types';
import { getPostPermalink } from '../../posts-types';
import { renderContentSync } from '../../utils/renderContent';
import { isPublicPost } from '../parse-post';

export interface Publication {
 url: string;
 revision: string;
 targets: string[];
 text: string;
 title?: string;
 published: string;
 syndicateTo: string[];
 sourcePath?: string;
}
const CANONICAL = 'https://caseyagollan.com';

/** A content revision excludes delivery bookkeeping so recording a result is not a new send. */
export async function publicationRevision(post: Post): Promise<string> {
 const state = JSON.stringify({
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

export async function publicationForPost(post: Post, origin = CANONICAL): Promise<Publication> {
 const site = new URL(origin).origin;
 const tree = fromHtml(renderContentSync(post.content, post.contentFormat), { fragment: true });
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
 if (post.inReplyTo) addTarget(post.inReplyTo);
 if (post.bookmarkOf) addTarget(post.bookmarkOf);
 return {
  url: new URL(getPostPermalink(post), site).href,
  revision: await publicationRevision(post), targets: [...targets], text,
  title: post.title, published: post.date, sourcePath: post.filePath,
  syndicateTo: [...new Set(post.syndicationTargets ?? [])]
 };
}

export async function createPublicationManifest(posts: Post[], origin = CANONICAL): Promise<{ version: 1; publications: Publication[] }> {
 const visible = posts.filter(post => !post.draft && isPublicPost(post) && Number.isFinite(Date.parse(post.date)));
 return { version: 1, publications: await Promise.all(visible.map(post => publicationForPost(post, origin))) };
}
