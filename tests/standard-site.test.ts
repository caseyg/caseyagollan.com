import { expect, test } from 'bun:test';
import { ATPROTO_DID, PUBLICATION_RKEY, PUBLICATION_URI, documentRkey, documentUri, isStandardDocument, tid } from '../src/lib/standard-site';
import { standardSiteCard, syncStandardSite } from '../src/lib/server/publishing/standard-site';
import { publicationForPost } from '../src/lib/server/publishing/publication';
import { syndicate, type SyndicationConfig } from '../src/lib/server/publishing/syndication';
import { syndicationOnce } from '../src/lib/server/publishing/delivery';
import type { DeliveryEvent } from '../src/lib/server/publishing/outbox';
import { parsePost } from '../src/lib/server/parse-post';

const article = parsePost('---\ndate: 2026-11-14T20:00:00-05:00\ntitle: 2026-11-14 Changelog\nsummary: A composer at /new.\ncategory: changelog\n---\nWrote a composer.', 'articles', '2026-11-14-changelog.md');
const config: SyndicationConfig = { bluesky: { service: 'https://bsky.social', identifier: 'caseyagollan.com', password: 'secret' }, standardSite: true };

function memoryBucket() {
	const files = new Map<string, { etag: string; data: string }>(); let revision = 0;
	const bucket = {
		async get(key: string) { const file = files.get(key); return file ? { etag: file.etag, json: async () => JSON.parse(file.data) } : null; },
		async put(key: string, data: string, options?: any) { const current = files.get(key); const cond = options?.onlyIf; if (cond?.etagMatches && current?.etag !== cond.etagMatches || cond?.etagDoesNotMatch === '*' && current) return null; const result = { etag: String(++revision), data }; files.set(key, result); return result; }
	} as unknown as R2Bucket;
	return { bucket, files };
}
/** A fake PDS: records calls, answers sign-in, blob uploads, writes and reads. */
function pds(did = ATPROTO_DID) {
	const calls: { method: string; body?: any }[] = [];
	const fetcher = async (url: string, init?: RequestInit) => {
		const method = new URL(url).pathname.replace('/xrpc/', '');
		if (url.endsWith('/author-avatar.webp')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
		const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
		calls.push({ method, body });
		if (method === 'com.atproto.server.createSession') return Response.json({ did, handle: 'caseyagollan.com', accessJwt: 'token' });
		if (method === 'com.atproto.repo.uploadBlob') return Response.json({ blob: { $type: 'blob', ref: { $link: 'bafyicon' }, mimeType: 'image/webp', size: 3 } });
		if (method === 'com.atproto.repo.getRecord') return Response.json({ uri: `at://${did}/app.bsky.feed.post/3mzoozs6d4tqh`, cid: 'bafypost' });
		if (method === 'com.atproto.repo.putRecord') return Response.json({ uri: `at://${did}/${body.collection}/${body.rkey}`, cid: `bafy${calls.length}` });
		return Response.json({});
	};
	return { calls, fetcher, writes: () => calls.filter(call => call.method === 'com.atproto.repo.putRecord').map(call => call.body) };
}

test('record keys are valid TIDs fixed by the post, and survive a rename', () => {
	expect(PUBLICATION_RKEY).toMatch(/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/);
	expect(PUBLICATION_URI).toBe(`at://${ATPROTO_DID}/site.standard.publication/${PUBLICATION_RKEY}`);
	expect(tid(0n, 0)).toBe('2222222222222');
	const key = documentRkey(article);
	expect(key).toMatch(/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/);
	expect(documentRkey({ ...article })).toBe(key);
	// Renamed: the first address still names the record.
	expect(documentRkey({ ...article, slug: 'renamed', previousUrls: ['/2026/11/14/changelog/'] })).toBe(key);
	expect(documentRkey({ ...article, slug: 'other' })).not.toBe(key);
	expect(documentUri(article)).toBe(`at://${ATPROTO_DID}/site.standard.document/${key}`);
});

test('only public titled articles are documents', async () => {
	expect(isStandardDocument(article)).toBe(true);
	expect(isStandardDocument({ ...article, title: undefined })).toBe(false);
	expect(isStandardDocument({ ...article, draft: true })).toBe(false);
	expect(isStandardDocument({ ...article, type: 'note' })).toBe(false);
	const publication = await publicationForPost(article);
	expect(publication.document).toEqual({ rkey: documentRkey(article), path: '/2026/11/14/changelog/', title: '2026-11-14 Changelog', description: 'A composer at /new.', tags: ['changelog'], publishedAt: '2026-11-15T01:00:00.000Z' });
	const note = await publicationForPost(parsePost('---\ndate: 2026-11-14T20:00:00-05:00\n---\nHi', 'notes', '2026-11-14-hi.md'));
	expect(note.document).toBeUndefined();
});

test('sync writes the publication once and each document when it changes, then removes gone ones', async () => {
	const { bucket } = memoryBucket(); const server = pds();
	const publication = await publicationForPost(article);
	expect(await syncStandardSite(bucket, config, [publication], { fetcher: server.fetcher, imageFetcher: server.fetcher })).toEqual({ written: 1, removed: 0 });
	const [site, document] = server.writes();
	expect(site).toMatchObject({ repo: ATPROTO_DID, collection: 'site.standard.publication', rkey: PUBLICATION_RKEY, record: { url: 'https://caseyagollan.com', name: 'Casey Gollan', icon: { ref: { $link: 'bafyicon' } } } });
	expect(site.validate).toBeUndefined();
	expect(document).toMatchObject({ collection: 'site.standard.document', rkey: publication.document!.rkey, record: { $type: 'site.standard.document', site: PUBLICATION_URI, path: '/2026/11/14/changelog/', title: '2026-11-14 Changelog', textContent: 'Wrote a composer.', publishedAt: '2026-11-15T01:00:00.000Z' } });

	// Nothing changed: no sign-in at all.
	const before = server.calls.length;
	expect(await syncStandardSite(bucket, config, [publication], { fetcher: server.fetcher })).toEqual({ written: 0, removed: 0 });
	expect(server.calls.length).toBe(before);

	// Syndicated since: the document is written again with its Bluesky post.
	const linked = { ...publication, document: { ...publication.document!, bskyPost: 'https://bsky.app/profile/caseyagollan.com/post/3mzoozs6d4tqh' } };
	expect(await syncStandardSite(bucket, config, [linked], { fetcher: server.fetcher })).toEqual({ written: 1, removed: 0 });
	expect(server.writes().at(-1).record.bskyPostRef).toEqual({ uri: `at://${ATPROTO_DID}/app.bsky.feed.post/3mzoozs6d4tqh`, cid: 'bafypost' });
	expect(server.writes().filter(write => write.collection === 'site.standard.publication')).toHaveLength(1);

	expect(await syncStandardSite(bucket, config, [], { fetcher: server.fetcher })).toEqual({ written: 0, removed: 1 });
	expect(server.calls.at(-1)).toMatchObject({ method: 'com.atproto.repo.deleteRecord', body: { collection: 'site.standard.document', rkey: publication.document!.rkey } });
});

test('never writes records to another account', async () => {
	const { bucket } = memoryBucket(); const server = pds('did:plc:someoneelse');
	await expect(syncStandardSite(bucket, config, [await publicationForPost(article)], { fetcher: server.fetcher, imageFetcher: server.fetcher })).rejects.toMatchObject({ retryable: false });
	expect(server.writes()).toHaveLength(0);
});

test('an article’s Bluesky post carries a card naming its document and publication', async () => {
	const { bucket } = memoryBucket(); const server = pds();
	const publication = await publicationForPost(article);
	const { card, session } = await standardSiteCard(bucket, config, publication, { fetcher: server.fetcher, imageFetcher: server.fetcher });
	expect(card.associatedRefs?.map(ref => ref.uri)).toEqual([documentUri(article), PUBLICATION_URI]);
	await syndicate('bluesky', { url: publication.url, text: publication.text, title: publication.title, published: publication.published, idempotencyKey: 'stable', card }, config, server.fetcher, undefined, session);
	// One sign-in serves the records and the post.
	expect(server.calls.filter(call => call.method === 'com.atproto.server.createSession')).toHaveLength(1);
	const post = server.writes().at(-1);
	expect(post.collection).toBe('app.bsky.feed.post');
	expect(post.record.embed).toEqual({ $type: 'app.bsky.embed.external', external: { uri: 'https://caseyagollan.com/2026/11/14/changelog/', title: '2026-11-14 Changelog', description: 'A composer at /new.', associatedRefs: card.associatedRefs } });
});

test('automatic sends add the card only when switched on, and fall back to a plain card', async () => {
	const publication = await publicationForPost(article);
	const event: DeliveryEvent = { source: publication.url, revision: publication.revision, action: 'publish', targets: [], syndicateTo: ['bluesky'], text: publication.text, title: publication.title, published: publication.published, document: publication.document };
	const off = pds();
	await syndicationOnce(memoryBucket().bucket, event, 'bluesky', { bluesky: config.bluesky }, off.fetcher, () => 0);
	expect(off.writes().map(write => write.collection)).toEqual(['app.bsky.feed.post']);
	expect(off.writes()[0].record.embed).toBeUndefined();

	const broken = pds('did:plc:someoneelse');
	await syndicationOnce(memoryBucket().bucket, event, 'bluesky', config, broken.fetcher, () => 0);
	const post = broken.writes().at(-1);
	expect(post.collection).toBe('app.bsky.feed.post');
	expect(post.record.embed.external).toEqual({ uri: publication.url, title: '2026-11-14 Changelog', description: 'A composer at /new.' });
});
