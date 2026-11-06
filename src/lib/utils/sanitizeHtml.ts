import { fromHtml } from 'hast-util-from-html';
import { defaultSchema, sanitize } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import type { Element, Root } from 'hast';

const schema = {
 ...defaultSchema,
 tagNames: [...(defaultSchema.tagNames ?? []).filter((tag) => tag !== 'input'), 'article', 'section', 'header', 'footer', 'figure', 'figcaption', 'time', 'video', 'audio', 'source', 'iframe'],
 strip: [...(defaultSchema.strip ?? []), 'script', 'style', 'svg', 'math', 'template', 'form', 'object', 'embed'],
 attributes: {
  ...defaultSchema.attributes,
  '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className'],
  a: [...(defaultSchema.attributes?.a ?? []).filter(attribute => !(Array.isArray(attribute) && attribute[0] === 'className')), 'className', 'rel'],
  time: ['dateTime', 'className'],
  video: ['src', 'poster', 'controls', 'preload', 'width', 'height'],
  audio: ['src', 'controls', 'preload'],
  source: ['src', 'type'],
  iframe: ['src', 'title', 'width', 'height', 'allowFullScreen', 'loading']
 },
 protocols: { ...defaultSchema.protocols, href: ['http', 'https', 'mailto', 'tel'], src: ['http', 'https'], poster: ['http', 'https'] }
};

function trustedFrame(src: unknown): boolean {
 if (typeof src !== 'string') return false;
 try {
  const url = new URL(src);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return ((url.hostname === 'www.youtube.com' || url.hostname === 'www.youtube-nocookie.com') && /^\/embed\/[\w-]{11}$/.test(url.pathname)) ||
   (url.hostname === 'player.vimeo.com' && /^\/video\/\d+$/.test(url.pathname));
 } catch { return false; }
}

// Keep the sanitizer's DOM-clobber protection stable across input/render passes.
function normalizeClobberPrefixes(node: Root | Element): void {
 if (node.type === 'element') {
  for (const key of defaultSchema.clobber ?? []) {
   const value = node.properties[key];
   const normalize = (item: string) => item.replace(/^(?:user-content-)+/, '');
   if (typeof value === 'string') node.properties[key] = normalize(value);
   else if (Array.isArray(value)) node.properties[key] = value.map((item) => typeof item === 'string' ? normalize(item) : item);
  }
 }
 for (const child of node.children) if (child.type === 'element') normalizeClobberPrefixes(child);
}

function restrictFrames(node: Root | Element): void {
 node.children = node.children.filter((child) => child.type !== 'element' || child.tagName !== 'iframe' || trustedFrame(child.properties.src));
 for (const child of node.children) {
  if (child.type === 'element') restrictFrames(child);
 }
}

/** Parse as browser HTML, allowlist markup and protocols, then serialize a safe fragment.
 * Shared by publishing input validation and every HTML render boundary. No DOM or Node APIs.
 */
export function sanitizePublishingHtml(html: string): string {
 const parsed = fromHtml(html, { fragment: true });
 normalizeClobberPrefixes(parsed);
 const tree = sanitize(parsed, schema);
 if (tree.type === 'root' || tree.type === 'element') restrictFrames(tree);
 return toHtml(tree);
}
