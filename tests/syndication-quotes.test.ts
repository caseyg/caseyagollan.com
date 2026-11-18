import { expect, test } from 'bun:test';
import { syndicate } from '../src/lib/server/publishing/syndication';
import { quoteNetwork } from '../src/lib/server/publishing/syndication-quotes';
import { publicationForPost } from '../src/lib/server/publishing/publication';
import { assertSyndicatable, editorDestinations } from '../src/lib/server/publishing/syndication-editor';
import { parsePost } from '../src/lib/server/parse-post';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';

const target = 'https://bsky.app/profile/ntnsndr.in/post/3n24vbfmows2q';
const toot = 'https://social.coop/@ntnsndr/115732687795909357';
const bluesky = { bluesky: { service: 'https://bsky.social', identifier: 'casey.test', password: 'secret' } };
const mastodon = { mastodon: { instance: 'https://social.coop', token: 'secret' } };
const post = { url: 'https://source.com/post', text: 'Worth reading.\nReposted ' + target, published: '2026-11-06T00:00:00Z', idempotencyKey: 'k', quote: { url: target, text: 'Worth reading.' } };

test('quotes are native only on the quoted post’s own network', () => {
	expect(quoteNetwork(target)).toBe('bluesky');
	expect(quoteNetwork('https://bsky.app/profile/did:plc:abc/post/3n24')).toBe('bluesky');
	expect(quoteNetwork(toot)).toBe('mastodon');
	expect(quoteNetwork('https://mastodon.social/users/someone/statuses/1234')).toBe('mastodon');
	for (const other of ['https://bsky.app/profile/ntnsndr.in', 'https://example.com/2026/11/essay/', 'http://social.coop/@a/1', 'not a url']) expect(quoteNetwork(other)).toBeUndefined();
});

function blueskyFetch(posts: unknown[], records: Record<string, unknown>[], calls: string[] = []) {
	return async (url: string, init?: RequestInit) => {
		calls.push(url);
		if (url.endsWith('createSession')) return Response.json({ did: 'did:plc:casey', handle: 'casey.test', accessJwt: 'jwt' });
		if (url.includes('resolveHandle')) return Response.json({ did: 'did:plc:nathan' });
		if (url.includes('getPosts')) return Response.json({ posts });
		if (url.endsWith('uploadBlob')) return Response.json({ blob: { $type: 'blob', ref: { $link: 'bafk' }, mimeType: 'image/jpeg', size: 64 } });
		records.push(JSON.parse(String(init?.body)).record); return Response.json({ cid: `cid${records.length}` });
	};
}

test('Bluesky sends a repost with a comment as a record embed, without the "Reposted" line', async () => {
	const records: Record<string, unknown>[] = []; const calls: string[] = [];
	await syndicate('bluesky', post, bluesky, blueskyFetch([{ uri: 'at://did:plc:nathan/app.bsky.feed.post/3n24vbfmows2q', cid: 'bafyquoted' }], records, calls));
	expect(records[0].text).toBe('Worth reading.\n\nhttps://source.com/post');
	expect(records[0].embed).toEqual({ $type: 'app.bsky.embed.record', record: { uri: 'at://did:plc:nathan/app.bsky.feed.post/3n24vbfmows2q', cid: 'bafyquoted' } });
	expect(calls.find(url => url.includes('getPosts'))).toContain(encodeURIComponent('at://did:plc:nathan/app.bsky.feed.post/3n24vbfmows2q'));
});

test('Bluesky quotes with photos as recordWithMedia, and only on the first post of a thread', async () => {
	const records: Record<string, unknown>[] = [];
	const media = [{ bytes: new Uint8Array(8), type: 'image/jpeg', alt: 'A dog' }];
	await syndicate('bluesky', { ...post, thread: ['One', 'Two'], media }, bluesky, blueskyFetch([{ uri: 'at://did:plc:nathan/app.bsky.feed.post/3n24vbfmows2q', cid: 'bafyquoted' }], records));
	expect(records[0].embed).toMatchObject({ $type: 'app.bsky.embed.recordWithMedia', record: { $type: 'app.bsky.embed.record', record: { cid: 'bafyquoted' } }, media: { $type: 'app.bsky.embed.images' } });
	expect(records[1].embed).toBeUndefined();
});

test('a Bluesky post that turned off quotes, or is gone, gets a link instead', async () => {
	for (const posts of [[{ uri: 'at://did:plc:nathan/app.bsky.feed.post/3n24vbfmows2q', cid: 'bafy', viewer: { embeddingDisabled: true } }], []]) {
		const records: Record<string, unknown>[] = [];
		await syndicate('bluesky', post, bluesky, blueskyFetch(posts, records));
		expect(records[0].embed).toBeUndefined();
		expect(records[0].text).toBe(`Worth reading.\n\nhttps://source.com/post\n\nRE: ${target}`);
		expect((records[0].facets as unknown[]).length).toBe(2);
	}
});

test('a failed lookup worth retrying stops the send instead of dropping the quote', async () => {
	const records: Record<string, unknown>[] = [];
	const fetcher = blueskyFetch([], records);
	await expect(syndicate('bluesky', post, bluesky, async (url, init) => url.includes('getPosts') ? new Response('', { status: 503 }) : fetcher(url, init))).rejects.toMatchObject({ retryable: true });
	expect(records).toEqual([]);
});

test('Mastodon quotes a resolved status with quoted_status_id', async () => {
	const sent: URLSearchParams[] = []; const searches: string[] = [];
	const fetcher = (current: string) => async (url: string, init?: RequestInit) => {
		if (url.includes('/api/v2/search')) { searches.push(url); return Response.json({ statuses: [{ id: '42', quote_approval: { current_user: current } }] }); }
		sent.push(new URLSearchParams(String(init?.body))); return Response.json({ url: 'https://social.coop/@caseyg/1', id: '1' });
	};
	const quote = { ...post, text: 'Worth reading.\nReposted ' + toot, quote: { url: toot, text: 'Worth reading.' } };
	await syndicate('mastodon', quote, mastodon, fetcher('automatic'));
	expect(new URL(searches[0]).searchParams.get('q')).toBe(toot);
	expect(new URL(searches[0]).searchParams.get('resolve')).toBe('true');
	expect(sent[0].get('quoted_status_id')).toBe('42');
	expect(sent[0].get('status')).toBe('Worth reading.\n\nhttps://source.com/post');
	// Denied quotes go out as a link.
	await syndicate('mastodon', { ...quote, idempotencyKey: 'other' }, mastodon, fetcher('denied'));
	expect(sent[1].get('quoted_status_id')).toBeNull();
	expect(sent[1].get('status')).toBe(`Worth reading.\n\nhttps://source.com/post\n\nRE: ${toot}`);
});

test('the other network gets the plain text, link included, and no lookup', async () => {
	const sent: URLSearchParams[] = []; const calls: string[] = [];
	await syndicate('mastodon', post, mastodon, async (url, init) => { calls.push(url); sent.push(new URLSearchParams(String(init?.body))); return Response.json({ url: 'https://social.coop/@caseyg/1', id: '1' }); });
	expect(calls).toEqual(['https://social.coop/api/v1/statuses']);
	expect(sent[0].get('status')).toBe(`Worth reading.\nReposted ${target}\n\nhttps://source.com/post`);
	expect(sent[0].get('quoted_status_id')).toBeNull();
});

const config: PublishingConfig = { me: 'https://example.com/', owner: 'caseyg', repo: 'content', branch: 'main', token: 'fake', timeZone: 'America/New_York', introspectionEndpoint: 'https://example.com/auth/introspect', syndication: { ...bluesky, ...mastodon } };

test('a repost with a comment is a quote; a plain repost is not, and stays unsyndicatable', async () => {
	const commented = parsePost(`---\ndate: 2026-11-12T14:17:36-05:00\nrepost-of:\n  - ${target}\n---\nWorth reading.`, 'reposts', '2026-11-12-quote.md');
	const publication = await publicationForPost(commented, config.me);
	expect(publication.text).toContain(target);
	expect(publication.quote).toEqual({ url: target, text: 'Worth reading.' });
	expect(() => assertSyndicatable(commented)).not.toThrow();
	const drafts = Object.fromEntries((await editorDestinations(config, commented)).map(d => [d.service, d.draft]));
	expect(drafts.bluesky).toBe('Worth reading.\n\nhttps://example.com/2026/11/12/quote/');
	expect(drafts.mastodon).toContain(`Reposted ${target}`);
	const plain = parsePost(`---\ndate: 2026-11-12T14:17:36-05:00\nrepost-of:\n  - ${target}\n---\n`, 'reposts', '2026-11-12-plain.md');
	expect((await publicationForPost(plain, config.me)).quote).toBeUndefined();
	expect(() => assertSyndicatable(plain)).toThrow();
});

test('a note quoting a post drops its "Quoting" line on the quoted post’s network', async () => {
	const note = parsePost(`---\ndate: 2026-11-12T14:17:36-05:00\nquotation-of:\n  - ${toot}\n---\nThis, exactly.`, 'notes', '2026-11-12-quoting.md');
	const publication = await publicationForPost(note, config.me);
	expect(publication.text).toContain('Quoting');
	expect(publication.quote).toEqual({ url: toot, text: 'This, exactly.' });
});
