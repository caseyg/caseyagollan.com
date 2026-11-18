export type SocialService = 'bluesky' | 'mastodon';
export interface FollowedAccount { service: SocialService; handle: string; name: string }
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
export function characterCount(text: string, service: SocialService): number {
 if (service === 'mastodon') text = text.replace(/https?:\/\/[^\s]+/g, 'x'.repeat(23)).replace(/@([\w.-]+)@[\w.-]+/g, '@$1');
 return Array.from(segmenter.segment(text)).length;
}
export function mentionQuery(text: string, caret: number) {
 const match = /(?:^|\s|[—(])@([\w.@-]*)$/.exec(text.slice(0, caret));
 return match ? { start: caret - match[1].length - 1, end: caret, query: match[1].toLowerCase() } : null;
}

/**
 * What each network takes with a post: Bluesky's app.bsky.embed.images (four images,
 * each at most 1,000,000 bytes, alt text of 2,000 graphemes in its app) and
 * Mastodon's defaults (four attachments, 16 MB images, 1,500-character descriptions).
 */
export const PHOTO_LIMITS: Record<SocialService, { count: number; alt: number; bytes: number; types: string[] }> = {
 bluesky: { count: 4, alt: 2000, bytes: 1_000_000, types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
 mastodon: { count: 4, alt: 1500, bytes: 16 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] }
};
/** Alt text length as the networks count it: characters a reader sees. */
export function altLength(text: string): number {
 return Array.from(segmenter.segment(text)).length;
}
