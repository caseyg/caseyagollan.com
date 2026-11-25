import type { Block, TableSummary } from '../tables';
import type { Post } from '../posts-types';
import type { StoredMention } from '../webmentions';

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
// A repost of a Bluesky post with a link card, and a like of a Mastodon post, as tables draw them. Saved media must
// live under files.caseyagollan.com/publishing/social/; this avatar is a real saved file.
const savedAvatar = 'https://files.caseyagollan.com/publishing/social/9d2d08fc3b03d6aedb727e409e777c895b9a6ecae116f49505c4df11e651e85e.webp';
const blueskyPost = {
	...savedPost, url: 'https://bsky.app/profile/did:plc:example/post/3paperwork',
	author: { name: 'Nick Seaver', handle: '@nickseaver.website', url: 'https://bsky.app/profile/nickseaver.website', avatar: savedAvatar },
	published: '2026-10-20T15:30:00-05:00',
	html: '<p>stumbled on a set of incredible 1970s illustrations in some government reports, so had to spend a day collecting them into a website to share with my friends on the computer: <a href="https://nickseaver.net/paperwork">nickseaver.net/paperwork</a></p>',
	preview: { url: 'https://nickseaver.net/paperwork', title: 'Commission on Federal Paperwork, 1976–1977', description: 'Illustrations from the U.S. Commission on Federal Paperwork. Drawn by Carol.', site: 'nickseaver.net' }
};
const mastodonPost = {
	...savedPost, url: 'https://social.coop/@friend/113', platform: 'mastodon' as const,
	author: { name: 'A Friend', handle: '@friend@social.coop', url: 'https://social.coop/@friend' },
	html: '<p>Calm technology is mostly about what a tool chooses not to tell you.</p>'
};
export const blueskyRepost: Post = { ...repost, slug: 'storybook-repost', properties: { 'repost-of': [blueskyPost.url] }, socialSnapshots: [blueskyPost] };
export const mastodonLike: Post = { ...reaction, slug: 'storybook-like', properties: { 'like-of': [mastodonPost.url] }, socialSnapshots: [mastodonPost] };
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
	arenaPrivateChannel: { kind: 'arena', url: 'https://www.are.na/casey-gollan/drafts', title: 'Drafts', meta: 'Private · Channel · 31 blocks', icon: '✳️' },
	arenaLink: { kind: 'arena', url: 'https://www.are.na/block/3010101', title: 'tabletop.grantcuster.com', meta: 'Link · grantcuster.com', icon: '🔗', image: '/library/img/0321918622.jpg' },
	arenaText: { kind: 'arena', url: 'https://www.are.na/block/1970355', title: 'Sander Moolin', meta: 'Text', icon: '📝', excerpt: '"Beaker is a client and a server rolled into one"' },
	raindrop: { kind: 'raindrop', url: 'https://www.robinsloan.com/lab/new-avenues/', title: 'New avenues for the internet', meta: 'Raindrop · robinsloan.com · 2026-10-02', icon: '📄', excerpt: 'Notes on small, homemade software and the web as a place you can still build a house.' },
	link: { kind: 'link', url: 'https://tabletop.grantcuster.com/', title: 'tabletop.grantcuster.com', meta: 'tabletop.grantcuster.com', image: '/library/img/0321918622.jpg' },
	image: { kind: 'image', url: '/2025/11/29/changelog/', title: 'Dark Matters, on the shelf', meta: 'From 2025-11-29 Changelog', image: '/library/img/0822359383.jpg' },
	quote: { kind: 'quote', url: '/wiki/aesthetic-crisis#:~:text=What%20is%20the%20nature', title: 'Aesthetic Crisis', excerpt: 'What is the nature of the crisis? It is hard to say. Architects dressed up as their own buildings, and the city went on without them.' },
	repost: { kind: 'post', url: '/2026/11/24/storybook-repost/', title: 'Post by Nick Seaver', meta: 'repost · 2026-11-24', icon: '🔁', excerpt: 'stumbled on a set of incredible 1970s illustrations in some government reports' },
	like: { kind: 'post', url: '/2026/11/24/storybook-like/', title: 'Post by A Friend', meta: 'like · 2026-11-24', icon: '⭐', excerpt: 'Calm technology is mostly about what a tool chooses not to tell you.' },
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

/** Webmentions of one post, as `/api/webmentions` returns them. */
const mentionOf = (id: number, kind: StoredMention['kind'], name: string, extra: Partial<StoredMention> = {}): StoredMention => ({
	id, kind, target: '/2026/01/10/storybook-note/', url: `https://social.example/@${name.toLowerCase().replace(/\W/g, '')}/${id}`,
	source: `https://brid.gy/comment/mastodon/${id}`, author: { name, url: `https://social.example/@${name.toLowerCase().replace(/\W/g, '')}`, photo: '' },
	published: '2026-01-11T09:30:00-05:00', ...extra
});
export const webmentions: StoredMention[] = [
	mentionOf(1, 'like', 'Ada Reader'), mentionOf(2, 'like', 'Bo Lin'), mentionOf(3, 'like', 'Chris Park'),
	mentionOf(4, 'repost', 'Dana Ortiz'),
	mentionOf(5, 'reply', 'Eli Moss', { html: '<p>This is how our studio works too. <a href="https://example.com/notes" rel="nofollow ugc noopener" target="_blank">Some notes</a> on it.</p>' }),
	mentionOf(6, 'reply', 'Fran Okafor', { text: 'Thank you for writing this down.' }),
	mentionOf(7, 'mention', 'A blog about tools', { url: 'https://blog.example.org/2026/01/tools', author: { name: '', url: '', photo: '' } })
];
export const longWebmentionReply: StoredMention = mentionOf(8, 'reply', 'Someone With A Very Long Display Name Indeed', {
	html: `<p>${'A long reply that keeps going, with a link to https://example.com/a/very/long/address/that/should/wrap/rather/than/overflow/the/page and more words. '.repeat(3)}</p>`
});

/** A post's Bluesky and Mastodon responses as the site reads them directly, replies nested. */
const nativeOf = (id: number, network: 'bluesky' | 'mastodon', kind: StoredMention['kind'], name: string, extra: Partial<StoredMention> = {}): StoredMention => {
	const handle = name.toLowerCase().replace(/\W/g, '');
	const url = network === 'bluesky' ? `https://bsky.app/profile/${handle}.bsky.social/post/3n${id}` : `https://mastodon.example/@${handle}/${id}`;
	return {
		id, kind, network, target: '/2026/01/10/storybook-note/', url, source: url,
		author: { name, url: network === 'bluesky' ? `https://bsky.app/profile/${handle}.bsky.social` : `https://mastodon.example/@${handle}`, photo: '' },
		published: `2026-01-11T${String(9 + (id % 10)).padStart(2, '0')}:00:00-05:00`, ...extra
	};
};
const nativeReply = (id: number, network: 'bluesky' | 'mastodon', name: string, text: string, parent?: StoredMention) =>
	nativeOf(id, network, 'reply', name, { text, html: `<p>${text}</p>`, ...(parent ? { parent: parent.url } : {}) });
const gia = nativeReply(11, 'bluesky', 'Gia Romero', 'Saving this. Did you write up the setup anywhere?');
const casey = nativeReply(12, 'bluesky', 'Casey Gollan', 'Not yet! It’s mostly a cron and a few JSON files. Happy to share notes.', gia);
const giaAgain = nativeReply(13, 'bluesky', 'Gia Romero', 'Please do 🙏', casey);
const hal = nativeReply(14, 'bluesky', 'Hal Ito', 'Same here. Curious how you handle deleted replies.', casey);
const deep = nativeReply(15, 'bluesky', 'Casey Gollan', 'Each read replaces the stored list, so a deleted reply just drops out.', hal);
const deeper = nativeReply(16, 'bluesky', 'Hal Ito', 'Simple. Nice.', deep);
const ines = nativeReply(17, 'mastodon', 'Inés Silva', 'Boosting for the fediverse folks.');
export const backfeedThread: StoredMention[] = [
	nativeOf(18, 'bluesky', 'like', 'Jo Park'), nativeOf(19, 'bluesky', 'like', 'Kim Lee'), nativeOf(20, 'mastodon', 'like', 'Lou Grant'),
	nativeOf(21, 'mastodon', 'repost', 'Inés Silva'),
	gia, casey, giaAgain, hal, deep, deeper, ines
];

const cite = (properties: Record<string, unknown[]>) => ({ type: ['h-cite'], properties });
/** One post of each IndieWeb type whose details render from its properties. */
export const postTypeExamples: Record<string, Post> = {
	quotation: { ...note, type: 'quotation', content: 'Still the best advice about drafts.', properties: { 'quotation-of': [cite({ content: ['The first draft of anything is just you telling yourself the story.'], author: ['Terry Pratchett'], name: ['A Slip of the Keyboard'], url: ['https://example.org/slip'] })] } },
	rsvp: { ...note, type: 'rsvp', inReplyTo: 'https://example.org/events/indieweb-camp', content: 'See you there!', properties: { rsvp: ['yes'], 'in-reply-to': ['https://example.org/events/indieweb-camp'] } },
	checkin: { ...note, type: 'checkin', content: 'Afternoon coffee.', properties: { checkin: [{ type: ['h-card'], properties: { name: ['Hungry Ghost'], url: ['https://example.org/hungry-ghost'], locality: ['Brooklyn'], region: ['NY'] } }] } },
	venue: { ...note, type: 'venue', microformatType: 'h-card', title: 'The Strand', content: '', properties: { name: ['The Strand'], 'street-address': ['828 Broadway'], locality: ['New York'], region: ['NY'], url: ['https://www.strandbooks.com/'], note: ['18 miles of books.'] } },
	read: { ...note, type: 'read', content: 'A strange, beautiful house of a book.', properties: { 'read-of': [cite({ name: ['Piranesi'], author: ['Susanna Clarke'], uid: ['isbn:9781635575637'] })], 'read-status': ['finished'] } },
	watch: { ...note, type: 'watch', content: '', properties: { 'watch-of': [cite({ name: ['Paris, Texas'], author: ['Wim Wenders'], url: ['https://example.org/paris-texas'] })] } },
	listen: { ...note, type: 'listen', content: '', properties: { 'listen-of': [cite({ name: ['Kind of Blue'], author: ['Miles Davis'] })] } },
	play: { ...note, type: 'play', content: 'Finally finished the Eye of the Universe.', properties: { 'play-of': [cite({ name: ['Outer Wilds'], url: ['https://example.org/outer-wilds'] })] } },
	jam: { ...note, type: 'jam', content: '', properties: { 'jam-of': [cite({ name: ['Heroes'], author: ['David Bowie'] })] } },
	collection: { ...note, type: 'collection', title: 'Tools I use every day', content: 'A short list, updated now and then.', properties: { name: ['Tools I use every day'], children: [cite({ name: ['Obsidian'], url: ['https://obsidian.md/'] }), cite({ name: ['Are.na'], url: ['https://www.are.na/'] }), 'https://example.org/a-link'] } },
	issue: { ...note, type: 'issue', title: 'Footer link is broken', inReplyTo: 'https://github.com/caseyg/caseyagollan.com', content: 'The colophon link in the footer returns a 404.', properties: { name: ['Footer link is broken'], 'in-reply-to': ['https://github.com/caseyg/caseyagollan.com'] } },
	exercise: { ...note, type: 'exercise', content: 'Easy loop around the park.', properties: { exercise: [{ type: ['h-exercise'], properties: { activity: ['run'], distance: ['5.2 km'], duration: ['PT28M30S'] } }] } },
	recipe: { ...note, type: 'recipe', microformatType: 'h-recipe', title: 'Tomato toast', content: 'Toast the bread. Rub it with garlic, pile on the tomatoes, and finish with salt and oil.', properties: { name: ['Tomato toast'], ingredient: ['1 thick slice of bread', '1 ripe tomato', '1 clove garlic', 'Olive oil and flaky salt'], yield: ['1 toast'], duration: ['PT10M'] } },
	audio: { ...note, type: 'audio', title: 'Voice memo', content: 'Thinking out loud about the library.', audio: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg', alt: 'Voice memo', type: 'audio/ogg' }], properties: { audio: ['https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg'] } }
};
