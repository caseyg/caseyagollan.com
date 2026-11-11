import { renderSocialCardHeader, renderSocialCardFooter, type SocialCardSource } from './social-card';
import { sanitizePublishingHtml } from './utils/sanitizeHtml';

export interface SocialSnapshot {
 version: 1;
 url: string;
 sourceUrl?: string;
 /** Canonical DID-based Bluesky identities, retained for index conversation grouping. */
 thread?: { post: string; root: string; parent?: string };
 platform: 'bluesky' | 'mastodon';
 author: { name: string; handle: string; url: string; avatar?: string };
 published: string;
 fetchedAt: string;
 html: string;
 warning?: string;
 preview?: { url: string; title: string; description: string; site?: string; image?: string };
 images: { src: string; alt: string }[];
 quote?: SocialSnapshot;
}

const bluePost = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/bsky\.app\/profile\/did:[^/?#]+\/post\/[a-zA-Z0-9]+$/.test(value);
const https = (v: unknown): v is string => {
 if (typeof v !== 'string') return false;
 try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
};
/** Only saved object paths are accepted; never hotlink original social media/CDNs. */
export function savedImageUrl(value: unknown): value is string {
 if (!https(value)) return false;
 const url = new URL(value);
 return !url.search && !url.hash && !url.port && /^\/(?:publishing|media)\/social\/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/.test(url.pathname);
}
export const MAX_QUOTE_DEPTH = 3;
export function socialSnapshots(value: unknown, depth = 0, seen = new Set<unknown>()): SocialSnapshot[] {
 if (!Array.isArray(value) || depth > MAX_QUOTE_DEPTH) return [];
 return value.filter((s): s is SocialSnapshot => !seen.has(s) && !!s && typeof s === 'object' && s.version === 1 && https(s.url) && (s.sourceUrl === undefined || https(s.sourceUrl)) && ['bluesky','mastodon'].includes(s.platform) &&
  s.author && typeof s.author.name === 'string' && typeof s.author.handle === 'string' && https(s.author.url) && typeof s.html === 'string' && (s.author.avatar === undefined || savedImageUrl(s.author.avatar)) &&
  (s.thread === undefined || (s.platform === 'bluesky' && bluePost(s.thread.post) && bluePost(s.thread.root) && (s.thread.parent === undefined || bluePost(s.thread.parent)))) &&
  typeof s.published === 'string' && Number.isFinite(Date.parse(s.published)) && typeof s.fetchedAt === 'string' &&
  (s.warning === undefined || typeof s.warning === 'string') && Array.isArray(s.images) && s.images.length <= 5 &&
  (s.preview === undefined || (https(s.preview?.url) && typeof s.preview.title === 'string' && typeof s.preview.description === 'string' && (s.preview.site === undefined || typeof s.preview.site === 'string') && (s.preview.image === undefined || savedImageUrl(s.preview.image)))) &&
  s.images.every((i: {src?: unknown; alt?: unknown}) => savedImageUrl(i?.src) && typeof i.alt === 'string') &&
  (s.quote === undefined || socialSnapshots([s.quote],depth+1,new Set([...seen,s])).length === 1));
}
const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/** All remote markup is sanitized again at the render boundary. Images are saved bytes only. */
export function renderSocialSnapshot(snapshot: SocialSnapshot, options: { omitSource?: boolean } = {}): string {
 const s = socialSnapshots([snapshot])[0];
 if (!s) return '';
 const body = sanitizePublishingHtml(s.html).replace(/<(?:img|iframe|video|audio|source)\b[^>]*>(?:<\/(?:iframe|video|audio)>)?/gi,'');
 const images = s.images.map(i=>`<a class="social-image-link" href="${escape(i.src)}"><img class="social-attachment" src="${escape(i.src)}" alt="${escape(i.alt)}" loading="lazy"></a>`).join('');
 const gallery = images ? `<div class="social-images social-images-${s.images.length}">${images}</div>` : '';
 const preview = s.preview;
 const card = preview ? `<a class="social-link-preview" href="${escape(preview.url)}">${preview.image ? `<img src="${escape(preview.image)}" alt="" loading="lazy">` : ''}<span class="social-link-preview-text"><span class="social-link-preview-site">${escape(preview.site || new URL(preview.url).hostname)}</span><strong>${escape(preview.title || preview.url)}</strong>${preview.description ? `<span class="social-link-preview-description">${escape(preview.description)}</span>` : ''}</span></a>` : '';
 const quote = s.quote ? `<div class="social-quoted-post">${renderSocialSnapshot(s.quote)}</div>` : '';
 const content = `<div class="social-post-content">${body}</div>${gallery}${card}${quote}`;
 return `<blockquote class="social-snapshot">${renderSocialCardHeader(s.author, options.omitSource ? undefined : snapshotSource(s))}${s.warning ? `<details><summary>${escape(s.warning)}</summary>${content}</details>` : content}${renderSocialCardFooter(s.published, s.url)}</blockquote>`;
}

function snapshotSource(s: SocialSnapshot): SocialCardSource {
 return s.platform === 'bluesky' ? { url: s.sourceUrl ?? s.url, label: '🦋', title: 'View on Bluesky' } : { url: s.sourceUrl ?? s.url, label: '🐘', title: 'View on Mastodon' };
}

/** Flatten for search facets while preserving one site entry for the outer action. */
export function flattenSocialSnapshots(values: SocialSnapshot[]): SocialSnapshot[] {
 const result:SocialSnapshot[]=[];const seen=new Set<SocialSnapshot>();
 const visit=(s:SocialSnapshot,depth:number)=>{if(!s||seen.has(s)||depth>MAX_QUOTE_DEPTH)return;seen.add(s);result.push(s);if(s.quote)visit(s.quote,depth+1);};
 for(const value of values)visit(value,0);return result;
}
