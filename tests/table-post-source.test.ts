import { describe, expect, test } from 'bun:test';
import { fetchSourcePost, isSocialPiece, isSourcePost, socialSize, sourceUrl, sourceView } from '../src/lib/table-post-source';
import { arenaKind } from '../src/lib/tables';
import { article, blocks, blueskyRepost, mastodonLike, note, reply, unsavedLike } from '../src/lib/storybook/fixtures';

describe('table blocks drawn like their source', () => {
	test('notes, replies, likes and reposts on this site fetch their post; articles and other sites do not', () => {
		expect(isSourcePost(blocks.repost)).toBe(true);
		expect(isSourcePost(blocks.like)).toBe(true);
		expect(isSourcePost(blocks.note)).toBe(true);
		expect(isSourcePost(blocks.article)).toBe(false);
		expect(isSourcePost({ ...blocks.note, url: '/2026/11/14/x/#post-y' })).toBe(false);
		expect(isSourcePost(blocks.socialPost)).toBe(false);
		expect(isSocialPiece(blocks.socialPost)).toBe(true);
		expect(isSocialPiece(blocks.link)).toBe(false);
	});

	test('a post page’s source.json sits beside it', () => {
		expect(sourceUrl('/2026/11/24/slug/')).toBe('/2026/11/24/slug/source.json');
		expect(sourceUrl('/2026/11/24/slug')).toBe('/2026/11/24/slug/source.json');
	});

	test('a repost or like draws the saved post, marked; a note draws itself; anything else stays plain', () => {
		expect(sourceView(blueskyRepost)).toMatchObject({ type: 'saved', snapshot: { author: { name: 'Nick Seaver' } }, mark: { label: 'reposted' } });
		expect(sourceView(mastodonLike)).toMatchObject({ type: 'saved', snapshot: { platform: 'mastodon' }, mark: { label: 'liked' } });
		expect(sourceView(note)).toEqual({ type: 'note', post: note });
		expect(sourceView(reply)?.type).toBe('note');
		expect(sourceView(unsavedLike)).toBeNull();
		expect(sourceView(article)).toBeNull();
		expect(sourceView(null)).toBeNull();
	});

	test('a missing source.json falls back to the plain tile, and is asked for once', async () => {
		let calls = 0;
		const fetcher = (async () => {
			calls++;
			return new Response('Not found', { status: 404 });
		}) as unknown as typeof fetch;
		expect(await fetchSourcePost('/2020/01/01/gone/', fetcher)).toBeNull();
		expect(await fetchSourcePost('/2020/01/01/gone/', fetcher)).toBeNull();
		expect(calls).toBe(1);
	});

	test('social posts start post-width and tall enough for their words and picture', () => {
		expect(socialSize({ excerpt: 'short' })).toEqual({ w: 360, h: 160 });
		expect(socialSize({ excerpt: 'x'.repeat(420), image: '/a.jpg' }).h).toBeGreaterThan(400);
		expect(socialSize({ excerpt: 'x'.repeat(5000), image: '/a.jpg' }).h).toBeLessThanOrEqual(560);
	});

	test('an Are.na block’s line says what it is', () => {
		expect(arenaKind(blocks.arenaChannel)).toEqual({ type: 'channel', private: false, detail: '5 blocks' });
		expect(arenaKind(blocks.arenaPrivateChannel)).toEqual({ type: 'channel', private: true, detail: '31 blocks' });
		expect(arenaKind(blocks.arenaImage)).toEqual({ type: 'image', private: false, detail: 'indiegogo.com' });
		expect(arenaKind({})).toEqual({ type: 'block', private: false, detail: '' });
	});
});

describe('plain links that stand for something richer', () => {
	const link = { kind: 'link' as const, url: '/2026/11/21/3n2tm63slgc2o', title: '/2026/11/21/3n2tm63slgc2o', meta: 'caseyagollan.com', icon: '🏠' };

	test('a link to a post path is a site post link; other pages and sites are not', async () => {
		const { isSitePostLink } = await import('../src/lib/table-post-source');
		expect(isSitePostLink(link)).toBe(true);
		expect(isSitePostLink({ ...link, url: '/library/' })).toBe(false);
		expect(isSitePostLink({ ...link, url: 'https://example.com/2026/11/21/x' })).toBe(false);
		expect(isSitePostLink({ ...link, kind: 'post' })).toBe(false);
	});

	test('a post becomes the block search would give: typed, dated, with the saved post’s words', async () => {
		const { blockFromPost } = await import('../src/lib/table-post-source');
		const liked = blockFromPost(mastodonLike, link.url);
		expect(liked).toMatchObject({ kind: 'post', url: '/2026/11/21/3n2tm63slgc2o/', icon: '⭐', meta: `like · ${mastodonLike.date.slice(0, 10)}` });
		expect(isSourcePost(liked)).toBe(true);
		expect(liked.excerpt).not.toContain('<');
		expect(blockFromPost(note, link.url)).toMatchObject({ kind: 'post', icon: '📝' });
	});

	test('a link to a like upgrades to the post; an article or a missing post stays a link', async () => {
		const { richerBlock } = await import('../src/lib/table-sources');
		const none = { search: async () => [], privateArena: async () => [] };
		expect(await richerBlock(link, { ...none, post: async () => mastodonLike })).toMatchObject({ kind: 'post', icon: '⭐' });
		expect(await richerBlock(link, { ...none, post: async () => article })).toBeNull();
		expect(await richerBlock(link, { ...none, post: async () => null })).toBeNull();
		expect(await richerBlock(blocks.note, { ...none, post: async () => mastodonLike })).toBeNull();
	});

	test('a link to one of Casey’s Are.na channels upgrades to the channel, private ones from the owner’s search', async () => {
		const { richerBlock, arenaChannelWords } = await import('../src/lib/table-sources');
		const channel = { kind: 'link' as const, url: 'https://are.na/casey-gollan/is-this-this-website', title: 'are.na/casey-gollan/is-this-this-website', meta: 'are.na' };
		expect(arenaChannelWords(channel.url)).toBe('is this this website');
		expect(arenaChannelWords('https://www.are.na/block/2092617')).toBeNull();
		expect(arenaChannelWords('https://example.com/a/b')).toBeNull();
		const asked: string[] = [];
		const search = async (words: string, filter?: string) => {
			asked.push(`${filter}:${words}`);
			return [blocks.arenaImage, blocks.arenaChannel];
		};
		const post = async () => null;
		expect(await richerBlock(channel, { post, search, privateArena: async () => [] })).toEqual(blocks.arenaChannel);
		expect(asked).toEqual(['arena:is this this website']);
		const hidden = { ...channel, url: 'https://www.are.na/casey-gollan/drafts/' };
		expect(await richerBlock(hidden, { post, search, privateArena: async () => [blocks.arenaPrivateChannel] })).toEqual(blocks.arenaPrivateChannel);
		expect(await richerBlock(hidden, { post, search, privateArena: async () => [] })).toBeNull();
	});
});
