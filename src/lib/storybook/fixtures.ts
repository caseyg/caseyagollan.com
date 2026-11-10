import type { Post } from '../posts-types';

export const note: Post = {
	slug: 'storybook-note', type: 'note', date: '2026-01-10T12:00:00-05:00',
	content: 'A small observation about **design**, technology, and working together.',
	contentFormat: 'markdown', category: ['Design', 'Research'], filePath: '',
	syndication: ['https://social.coop/@caseyg/123', 'https://bsky.app/profile/example.com/post/123']
};
export const article: Post = { ...note, type: 'article', title: 'Making space for experimentation', content: 'An introduction to a longer piece about creative practice.\n\n## Start with curiosity\n\nTry something small, learn from it, and share what you find.' };
export const bookmark: Post = { ...note, type: 'bookmark', title: 'School for Poetic Computation', bookmarkOf: 'https://sfpc.study/', content: 'Learning at the intersection of art, code, and community.' };
export const reply: Post = { ...note, type: 'reply', inReplyTo: 'https://example.com/ideas', content: 'This resonates with how I think about research and creative work.' };
export const photo: Post = { ...note, type: 'photo', photo: [{ url: '/sisu.gif', alt: 'Sisu, an animated illustration' }] };
export const reaction: Post = { ...note, type: 'like', content: '', properties: { 'like-of': ['https://example.com/ideas'] } };
