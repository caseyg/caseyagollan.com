import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { Root, Element } from 'hast';
import type { Post } from '../src/lib/posts-types';
import { renderPostDetails } from '../src/lib/utils/post-details';
import { renderContentSync } from '../src/lib/utils/renderContent';
import { uniqueLabels } from './search-filters';

export const escapeSearchHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Lead excerpts with the actual social text; retain author/header/footer text for searching. */
function searchableDetails(post: Post): string {
 const tree = fromHtml(renderPostDetails(post), {fragment: true});
 function visit(node: Root | Element) {
  if (node.type === 'element' && node.tagName === 'blockquote') {
   const context = node.children.filter(child => child.type === 'element' && ['header', 'footer'].includes(child.tagName));
   node.children = [...node.children.filter(child => !context.includes(child)), ...context].flatMap(child => [child, {type: 'text' as const, value: ' '}]);
  }
  if (node.type === 'element' && (node.properties.className as string[] | undefined)?.some(name => ['social-author-details', 'social-link-preview-text'].includes(name))) {
   node.children = node.children.flatMap(child => [child, {type: 'text' as const, value: ' '}]);
  }
  for (const child of node.children) if (child.type === 'element') visit(child);
 }
 visit(tree);
 return toHtml(tree);
}

/** Use the same saved markup as permalinks, including social link-preview cards. No network reads. */
export function postSearchContent(post: Post): string {
 const escape = escapeSearchHtml;
 return [
  searchableDetails(post),
  post.summary ? `<p>${escape(post.summary)}</p>` : '',
  renderContentSync(post.content, post.contentFormat),
  post.bookmarkOf ? `<p>${escape(post.bookmarkOf)}</p>` : '',
  ...[...(post.photo ?? []), ...(post.video ?? [])].filter(media => media.alt).map(media => `<p>${escape(media.alt)}</p>`)
 ].join('\n');
}

/** Explicitly pair custom image metadata with alt text; never use social avatars. */
export function postSearchImage(post: Post): Record<string, string> {
 const photo = post.photo?.find(photo => photo.url);
 if (photo) return {image: photo.url, image_alt: photo.alt ?? ''};
 const tree = fromHtml(postSearchContent(post), {fragment: true});
 function find(node: Root | Element): Element | undefined {
  if (node.type === 'element' && node.tagName === 'img' && node.properties.src && !(node.properties.className as string[] | undefined)?.includes('social-avatar')) return node;
  for (const child of node.children) {
   if (child.type !== 'element') continue;
   const image = find(child);
   if (image) return image;
  }
 }
 const image = find(tree);
 return image ? {image: String(image.properties.src), image_alt: String(image.properties.alt ?? '')} : {};
}

export function postSearchTitle(post: Post): string {
 if (post.title || post.summary) return post.title || post.summary!;
 const social = post.socialSnapshots?.[0];
 if (social && ['like', 'repost'].includes(post.type)) {
  return social.preview?.title || `Post by ${social.author.name || social.author.handle}`;
 }
 return `${post.type[0].toUpperCase() + post.type.slice(1)} · ${post.date.slice(0, 10)}`;
}

/** Keep faceting/metadata out of the excerpt, rather than indexing repeated labels as prose. */
export function searchDocument(title: string, type: string, metadata: Record<string, unknown>, content: string, filters: Record<string, string[]> = {}): string {
 const escape = escapeSearchHtml;
 const filterHtml = Object.entries({Type: [type], ...filters}).flatMap(([key, values]) => uniqueLabels(values).map(value => `<span data-pagefind-filter="${escape(key)}">${escape(value)}</span>`)).join(' ');
 const meta = Object.entries({title, type, ...metadata}).map(([key, value]) => `<span data-pagefind-meta="${escape(key)}">${escape(value)}</span>`).join(' ');
 return `<html lang="en"><body><div data-pagefind-ignore>${meta} ${filterHtml}</div><article data-pagefind-body>${content}</article></body></html>`;
}
