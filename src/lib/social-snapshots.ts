import { sanitizePublishingHtml } from './utils/sanitizeHtml';

export interface SocialSnapshot {
 version: 1;
 url: string;
 platform: 'bluesky' | 'mastodon';
 author: { name: string; handle: string; url: string; avatar?: string };
 published: string;
 fetchedAt: string;
 html: string;
 warning?: string;
 images: { src: string; alt: string }[];
}

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
export function socialSnapshots(value: unknown): SocialSnapshot[] {
 if (!Array.isArray(value)) return [];
 return value.filter((s): s is SocialSnapshot => !!s && typeof s === 'object' && s.version === 1 && https(s.url) && ['bluesky','mastodon'].includes(s.platform) &&
  s.author && typeof s.author.name === 'string' && typeof s.author.handle === 'string' && https(s.author.url) && typeof s.html === 'string' && (s.author.avatar === undefined || savedImageUrl(s.author.avatar)) &&
  typeof s.published === 'string' && Number.isFinite(Date.parse(s.published)) && typeof s.fetchedAt === 'string' &&
  (s.warning === undefined || typeof s.warning === 'string') && Array.isArray(s.images) && s.images.length <= 5 &&
  s.images.every((i: {src?: unknown; alt?: unknown}) => savedImageUrl(i?.src) && typeof i.alt === 'string'));
}
const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/** All remote markup is sanitized again at the render boundary. Images are saved bytes only. */
export function renderSocialSnapshot(snapshot: SocialSnapshot): string {
 const s = socialSnapshots([snapshot])[0];
 if (!s) return '';
 const body = sanitizePublishingHtml(s.html).replace(/<(?:img|iframe|video|audio|source)\b[^>]*>(?:<\/(?:iframe|video|audio)>)?/gi,'');
 const images = s.images.map(i=>`<a class="social-image-link" href="${escape(i.src)}"><img class="social-attachment" src="${escape(i.src)}" alt="${escape(i.alt)}" loading="lazy"></a>`).join('');
 const gallery = images ? `<div class="social-images social-images-${s.images.length}">${images}</div>` : '';
 const content = `<div class="social-post-content">${body}</div>${gallery}`;
 const date = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'}).format(new Date(s.published));
 const clock = new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(new Date(s.published));
 const avatar = s.author.avatar ? `<img class="social-avatar" src="${escape(s.author.avatar)}" alt="" loading="lazy">` : '';
 return `<blockquote class="social-snapshot"><header><a class="social-author" href="${escape(s.author.url)}">${avatar}<span class="social-author-details"><strong class="social-author-name">${escape(s.author.name)}</strong><span class="social-author-handle">${escape(s.author.handle)}</span></span></a><a class="social-platform" href="${escape(s.url)}" aria-label="View original post">${s.platform === 'bluesky' ? 'Bluesky' : 'Mastodon'} ↗</a></header>${s.warning ? `<details><summary>${escape(s.warning)}</summary>${content}</details>` : content}<footer><a href="${escape(s.url)}"><time datetime="${escape(s.published)}">${escape(clock)} · ${escape(date)}</time></a></footer></blockquote>`;
}
