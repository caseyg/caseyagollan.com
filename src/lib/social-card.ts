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
export function renderSocialCardHeader(author: SocialCardAuthor, source?: {url: string; label: string}): string {
 const avatar = author.avatar ? `<img class="social-avatar" src="${escape(author.avatar)}" alt="" loading="lazy">` : '';
 return `<header><a class="social-author" href="${escape(author.url)}">${avatar}<span class="social-author-details"><strong class="social-author-name">${escape(author.name)}</strong>${author.handle ? `<span class="social-author-handle">${escape(author.handle)}</span>` : ''}</span></a>${source ? `<a class="social-platform" href="${escape(source.url)}" aria-label="View original post">${escape(source.label)} ↗</a>` : ''}</header>`;
}
export function renderSocialCardFooter(published: string, url: string): string {
 const date = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'}).format(new Date(published));
 const clock = new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(new Date(published));
 return `<footer><a href="${escape(url)}"><time datetime="${escape(published)}">${escape(clock)} · ${escape(date)}</time></a></footer>`;
}
