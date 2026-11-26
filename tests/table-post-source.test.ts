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
