import type { Block, TableSummary } from '../tables';
import type { Post } from '../posts-types';

export const note: Post = {
	slug: 'storybook-note', type: 'note', date: '2026-01-10T12:00:00-05:00',
	content: 'A small observation about **design**, technology, and working together.',
	contentFormat: 'markdown', category: ['Design', 'Research'], filePath: '',
	syndication: ['https://social.coop/@caseyg/123', 'https://bsky.app/profile/example.com/post/123']
};
export const article: Post = { ...note, type: 'article', title: 'Making space for experimentation', content: 'An introduction to a longer piece about creative practice.\n\n## Start with curiosity\n\nTry something small, learn from it, and share what you find.' };
export const bookmark: Post = { ...note, type: 'bookmark', title: 'School for Poetic Computation', bookmarkOf: 'https://sfpc.study/', content: 'Learning at the intersection of art, code, and community.' };
const savedPost = {
	version: 1 as const, url: 'https://bsky.app/profile/example.com/post/abc', platform: 'bluesky' as const,
	author: { name: 'Example Reader', handle: '@example.com', url: 'https://bsky.app/profile/example.com' },
	published: '2026-01-09T15:30:00-05:00', fetchedAt: '2026-01-10T12:00:00-05:00',
	html: '<p>Research is a way of paying attention together.</p>', images: []
};
export const reply: Post = { ...note, type: 'reply', inReplyTo: savedPost.url, socialSnapshots: [savedPost], content: 'This resonates with how I think about research and creative work.' };
export const photo: Post = { ...note, type: 'photo', photo: [{ url: '/sisu.gif', alt: 'Sisu, an animated illustration' }] };
export const reaction: Post = { ...note, type: 'like', content: '', syndication: [], properties: { 'like-of': [savedPost.url] }, socialSnapshots: [savedPost] };
export const repost: Post = { ...reaction, type: 'repost', properties: { 'repost-of': [savedPost.url] } };
export const unsavedLike: Post = { ...reaction, properties: { 'like-of': ['https://example.com/ideas'] }, socialSnapshots: [] };

/* Tables: blocks as the block picker makes them from site search. */

export const blocks = {
	article: { kind: 'post', url: '/2025/11/29/changelog/', title: '2025-11-29 Changelog', meta: 'article · 2025-11-29', icon: '📄', excerpt: 'Screenshot previews on citation nodes, smoother loading animations, migrated to Cloudflare Workers. Posts got a UI refresh with type icons, date-based permalinks, and restored webmentions.' },
	note: { kind: 'post', url: '/2026/11/14/3n2cde25cgc2m/', title: 'Happy belated bday to @shannonmattern.bsky.social', meta: 'note · 2026-11-14', icon: '📝', excerpt: 'Thank you for being a beacon of light (and carrier of the "small, weird, local" torch).' },
	book: { kind: 'book', url: '/library/0822359383', title: 'Dark Matters: On the Surveillance of Blackness', meta: 'Browne, Simone · 2015', image: '/library/img/0822359383.jpg' },
	bookNoCover: { kind: 'book', url: '/library/0374532559', title: 'Trickster Makes This World: Mischief, Myth and Art', meta: 'Hyde, Lewis · 2010' },
	wiki: { kind: 'wiki', url: 'https://cag.wiki/Aesthetic+Crisis', title: 'Aesthetic Crisis', meta: 'cag.wiki', excerpt: 'Architects dressed up for the 1931 Beaux Arts Ball; photo from the collection of Christopher Gray. What is the nature of the crisis? It is hard to say.' },
	arenaChannel: { kind: 'arena', url: 'https://www.are.na/casey-gollan/is-this-this-website', title: 'Is This This Website?', meta: 'Channel · 5 blocks', icon: '✳️', excerpt: 'Metaphors for websites — discuss!' },
	arenaImage: { kind: 'arena', url: 'https://www.are.na/block/2092617', title: 'Light Phone 2', meta: 'Image · indiegogo.com', icon: '🖼️', image: 'https://images.are.na/eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiIyMDkyNjE3L29yaWdpbmFsXzk5ZjA3MzhjMjE1MTUyZGQxYThkZmExODMyNzg1YzYxLmpwZyIsImVkaXRzIjp7InJlc2l6ZSI6eyJ3aWR0aCI6NDAwLCJoZWlnaHQiOjQwMCwiZml0IjoiaW5zaWRlIiwid2l0aG91dEVubGFyZ2VtZW50Ijp0cnVlfSwid2VicCI6eyJxdWFsaXR5Ijo3NX0sImpwZWciOnsicXVhbGl0eSI6NzV9LCJyb3RhdGUiOm51bGx9fQ==' },
	arenaText: { kind: 'arena', url: 'https://www.are.na/block/1970355', title: 'Sander Moolin', meta: 'Text', icon: '📝', excerpt: '"Beaker is a client and a server rolled into one"' },
	link: { kind: 'link', url: 'https://tabletop.grantcuster.com/', title: 'tabletop.grantcuster.com', meta: 'tabletop.grantcuster.com', image: '/library/img/0321918622.jpg' },
	image: { kind: 'image', url: '/2025/11/29/changelog/', title: 'Dark Matters, on the shelf', meta: 'From 2025-11-29 Changelog', image: '/library/img/0822359383.jpg' },
	quote: { kind: 'quote', url: '/wiki/aesthetic-crisis#:~:text=What%20is%20the%20nature', title: 'Aesthetic Crisis', excerpt: 'What is the nature of the crisis? It is hard to say. Architects dressed up as their own buildings, and the city went on without them.' },
	socialPost: { kind: 'post', url: 'https://bsky.app/profile/shannonmattern.bsky.social/post/3abc', title: 'Shannon Mattern', meta: '@shannonmattern.bsky.social', icon: '🦋', excerpt: 'Small, weird, local: a torch worth carrying.' },
	longTitle: { kind: 'book', url: '/library/0306808935', title: 'Talking Music: Conversations With John Cage, Philip Glass, Laurie Anderson, And 5 Generations Of American Experimental Composers', meta: 'Duckworth, William · 1999' }
} satisfies Record<string, Block>;

export const tableSummary: TableSummary = {
	id: 'sample1234',
	name: 'Reading room',
	created: '2026-11-14T18:00:00.000Z',
	updated: '2026-11-15T06:40:00.000Z',
	count: 9,
	preview: [blocks.article, blocks.book, blocks.wiki, blocks.link]
};
