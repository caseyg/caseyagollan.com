/** Shared card markup for native Notes and saved social posts, including feeds. */
export interface SocialCardAuthor {
 name: string;
 url: string;
 avatar?: string;
 handle?: string;
}
export const siteAuthor: SocialCardAuthor = {
 name: 'Casey Gollan', url: 'https://caseyagollan.com', avatar: '/author-avatar.webp'
};
const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/** An outbound link to a copy of a post on another network. */
export interface SocialCardSource { url: string; label: string; title: string; className?: string }
/** Networks are always shown as their mark (🦋, 🐘), never spelled out; the name is kept for assistive tech. */
export function socialSource(url: string, className?: string): SocialCardSource {
 let host = url;
 try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep the raw value */ }
 if (host === 'bsky.app' || host.endsWith('.bsky.social')) return { url, label: '🦋', title: 'View on Bluesky', className };
 if (host === 'twitter.com' || host === 'x.com') return { url, label: '🐦', title: 'View on X', className };
 if (host === 'social.coop' || host.includes('mastodon') || /^\/(@[^/]+|users\/[^/]+\/statuses)\/\d+\/?$/.test(pathOf(url))) return { url, label: '🐘', title: 'View on Mastodon', className };
 return { url, label: '🔗', title: `View on ${host}`, className };
}
function pathOf(url: string): string { try { return new URL(url).pathname; } catch { return ''; } }
export function renderSocialCardHeader(author: SocialCardAuthor, source?: SocialCardSource | SocialCardSource[]): string {
 const avatar = author.avatar ? `<img class="social-avatar" src="${escape(author.avatar)}" alt="" loading="lazy">` : '';
 const sources = (Array.isArray(source) ? source : source ? [source] : []).map(s => `<a class="social-platform${s.className ? ` ${escape(s.className)}` : ''}" href="${escape(s.url)}" aria-label="${escape(s.title)}" title="${escape(s.title)}">${escape(s.label)}</a>`).join('');
 return `<header><a class="social-author" href="${escape(author.url)}">${avatar}<span class="social-author-details"><strong class="social-author-name">${escape(author.name)}</strong>${author.handle ? `<span class="social-author-handle">${escape(author.handle)}</span>` : ''}</span></a>${sources ? `<span class="social-platforms">${sources}</span>` : ''}</header>`;
}
export function renderSocialCardFooter(published: string, url: string): string {
 const date = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'}).format(new Date(published));
 const clock = new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(new Date(published));
 return `<footer><a href="${escape(url)}"><time datetime="${escape(published)}">${escape(clock)} · ${escape(date)}</time></a></footer>`;
}
