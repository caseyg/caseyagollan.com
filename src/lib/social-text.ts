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
