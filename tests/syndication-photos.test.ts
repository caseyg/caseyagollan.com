import { expect, test } from 'bun:test';
import { imageSize, preparePhotos, sniffImageType, uploadMastodonMedia } from '../src/lib/server/publishing/syndication-photos';
import { syndicate } from '../src/lib/server/publishing/syndication';
import { chosenPhotos, postPhotos, sendEditorDrafts } from '../src/lib/server/publishing/syndication-editor';
import { parsePost } from '../src/lib/server/parse-post';
import { publicationForPost } from '../src/lib/server/publishing/publication';
import { readDocument } from '../src/lib/server/publishing/document';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';

/** A PNG header of the given size, padded to `bytes`. */
function png(width: number, height: number, bytes = 64): Uint8Array<ArrayBuffer> {
	const data = new Uint8Array(bytes);
	data.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
	const view = new DataView(data.buffer);
	view.setUint32(16, width); view.setUint32(20, height);
	return data;
}
/** A JPEG with an APP0 segment before its SOF0 frame header. */
function jpeg(width: number, height: number, bytes = 64): Uint8Array<ArrayBuffer> {
	const data = new Uint8Array(bytes);
	data.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255]);
	return data;
}
function bucket(objects: Record<string, Uint8Array<ArrayBuffer>>) {
	return { async get(key: string) { const bytes = objects[key]; return bytes ? { size: bytes.length, arrayBuffer: async () => bytes.slice().buffer } : null; } } as unknown as R2Bucket;
}
/** An Images binding that returns a JPEG of the given size for each step it is asked for. */
function images(sizes: number[]) {
	const steps: unknown[] = [];
	const binding = {
		input: () => ({ transform: (transform: unknown) => ({ output: (output: unknown) => { steps.push({ transform, output }); return Promise.resolve({ response: () => new Response(jpeg(2048, 1536, sizes[steps.length - 1] ?? 10)) }); } }) })
	} as unknown as ImagesBinding;
	return { binding, steps };
}

test('image types and sizes are read from their headers', () => {
	expect(sniffImageType(png(1, 1))).toBe('image/png');
	expect(sniffImageType(jpeg(1, 1))).toBe('image/jpeg');
	expect(sniffImageType(new TextEncoder().encode('<svg></svg>'))).toBeUndefined();
	expect(imageSize(png(3024, 4032))).toEqual({ width: 3024, height: 4032 });
	expect(imageSize(jpeg(4000, 3000))).toEqual({ width: 4000, height: 3000 });
});

test('photos are read from the media bucket and fitted to each network', async () => {
	const sources = { mediaBucket: bucket({ 'a.png': png(800, 600), 'big.jpg': jpeg(6000, 4000, 2_000_000) }), mediaBaseUrl: 'https://files.example.com/' };
	const [small] = await preparePhotos('bluesky', [{ url: 'https://files.example.com/a.png', alt: ' A dog ' }], sources);
	expect(small).toMatchObject({ type: 'image/png', alt: 'A dog', width: 800, height: 600 });

	// Bluesky takes 1 MB per image; Mastodon takes this photo as it is.
	const { binding, steps } = images([1_200_000, 900_000]);
	const [shrunk] = await preparePhotos('bluesky', [{ url: 'https://files.example.com/big.jpg', alt: '' }], { ...sources, images: binding });
	expect(shrunk.bytes.length).toBe(900_000);
	expect(steps).toHaveLength(2);
	expect(steps[0]).toEqual({ transform: { width: 2048, height: 2048, fit: 'scale-down' }, output: { format: 'image/jpeg', quality: 85 } });
	const [kept] = await preparePhotos('mastodon', [{ url: 'https://files.example.com/big.jpg', alt: '' }], sources);
	expect(kept.bytes.length).toBe(2_000_000);

	await expect(preparePhotos('bluesky', [{ url: 'https://files.example.com/big.jpg', alt: '' }], sources)).rejects.toMatchObject({ retryable: false });
	await expect(preparePhotos('mastodon', [{ url: 'https://files.example.com/a.png', alt: 'x'.repeat(1501) }], sources)).rejects.toThrow('1500');
	await expect(preparePhotos('bluesky', Array(5).fill({ url: 'https://files.example.com/a.png', alt: '' }), sources)).rejects.toThrow('up to 4');
});

test('Mastodon attaches uploaded media with descriptions, waiting while it processes', async () => {
	const calls: { url: string; init?: RequestInit }[] = [];
	const photo = { bytes: png(10, 10), type: 'image/png', alt: 'A dog' };
	const result = await syndicate('mastodon', { url: 'https://source.com/post', text: 'Hello', published: '2026-11-06T00:00:00Z', idempotencyKey: 'k', media: [photo, { ...photo, alt: '' }] }, { mastodon: { instance: 'https://social.coop', token: 'secret' } }, async (url, init) => {
		calls.push({ url, init });
		if (url.endsWith('/api/v2/media')) return Response.json({ id: String(calls.length), url: calls.length === 1 ? 'https://files/1' : null }, { status: calls.length === 1 ? 200 : 202 });
		if (url.includes('/api/v1/media/')) return Response.json({ id: '2', url: 'https://files/2' });
		return Response.json({ url: 'https://social.coop/@casey/9' });
	});
	expect(result).toBe('https://social.coop/@casey/9');
	const first = calls[0].init?.body as FormData;
	expect(first.get('description')).toBe('A dog');
	expect((calls[1].init?.body as FormData).has('description')).toBe(false);
	expect(calls[2].url).toBe('https://social.coop/api/v1/media/2');
	expect(new URLSearchParams(String(calls[3].init?.body)).getAll('media_ids[]')).toEqual(['1', '2']);

	// A failed upload stops before any status is posted.
	await expect(uploadMastodonMedia('https://social.coop', 't', [photo], async () => new Response('', { status: 422 }))).rejects.toMatchObject({ retryable: false });
});

test('Bluesky posts an images embed with alt text and aspect ratios', async () => {
	let record: Record<string, unknown> = {}; let uploaded = '';
	await syndicate('bluesky', { url: 'https://source.com/post', text: 'Hello', published: '2026-11-06T00:00:00Z', idempotencyKey: 'k', media: [{ bytes: jpeg(4000, 3000), type: 'image/jpeg', alt: 'A dog', width: 4000, height: 3000 }] }, { bluesky: { service: 'https://bsky.social', identifier: 'casey.test', password: 'secret' } }, async (url, init) => {
		if (url.endsWith('createSession')) return Response.json({ did: 'did:plc:test', accessJwt: 'jwt' });
		if (url.endsWith('uploadBlob')) { uploaded = new Headers(init?.headers).get('content-type')!; return Response.json({ blob: { $type: 'blob', ref: { $link: 'bafk' }, mimeType: 'image/jpeg', size: 64 } }); }
		record = JSON.parse(String(init?.body)).record; return Response.json({});
	});
	expect(uploaded).toBe('image/jpeg');
	expect(record.embed).toEqual({ $type: 'app.bsky.embed.images', images: [{ alt: 'A dog', image: { $type: 'blob', ref: { $link: 'bafk' }, mimeType: 'image/jpeg', size: 64 }, aspectRatio: { width: 4000, height: 3000 } }] });
});

test('chosen photos must be the post’s own, once each', () => {
	const post = [{ url: 'https://files.example.com/a.png', alt: 'A' }, { url: 'https://files.example.com/b.png', alt: '' }];
	expect(chosenPhotos(post, undefined)).toEqual(post);
	expect(chosenPhotos(post, [{ url: post[1].url, alt: ' New\nalt ', post: 0 }])).toEqual([{ url: post[1].url, alt: 'New alt' }]);
	expect(chosenPhotos(post, [])).toEqual([]);
	for (const bad of ['invalid', [{ url: 'https://evil.example/x.png', alt: '' }], [{ url: post[0].url, alt: '' }, { url: post[0].url, alt: '' }], [{ url: post[0].url }]]) expect(() => chosenPhotos(post, bad)).toThrow();
});

test('a manual send attaches the chosen photos and saves edited alt text to the post', async () => {
	const markdown = '---\ndate: 2026-11-06T12:00:00-05:00\nphoto:\n  - https://files.example.com/a.png\n  - url: https://files.example.com/b.png\n    alt: Old\n---\nTwo photos';
	const post = parsePost(markdown, 'photos', '2026-11-06-photos.md');
	const rows = new Map<string, { etag: string; value: string }>(); let version = 0;
	const state = {
		async get(key: string) { const row = rows.get(key); return row ? { etag: row.etag, json: async () => JSON.parse(row.value) } : null; },
		async put(key: string, value: string) { const row = { etag: String(++version), value }; rows.set(key, row); return row; }
	} as unknown as R2Bucket;
	const config: PublishingConfig = { me: 'https://example.com/', owner: 'caseyg', repo: 'content', branch: 'main', token: 'fake', timeZone: 'America/New_York', introspectionEndpoint: 'https://example.com/auth/introspect', state,
		mediaBucket: bucket({ 'a.png': png(100, 50), 'b.png': png(50, 100) }), mediaBaseUrl: 'https://files.example.com/',
		syndication: { mastodon: { instance: 'https://social.coop', token: 'fake' } } };
	let content = markdown; let message = '';
	const gitFetch = (async (url: string, init: RequestInit) => {
		if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'head' } });
		if (url.endsWith('/graphql')) { const input = JSON.parse(String(init.body)).variables.input; content = Buffer.from(input.fileChanges.additions[0].contents, 'base64').toString(); message = input.message.headline; return Response.json({ data: { createCommitOnBranch: { commit: { oid: 'c' } } } }); }
		return Response.json({ type: 'file', path: post.filePath, sha: 'blob', encoding: 'base64', content: Buffer.from(content).toString('base64') });
	}) as typeof fetch;
	expect(await postPhotos(config, post)).toEqual([{ url: 'https://files.example.com/a.png', alt: '' }, { url: 'https://files.example.com/b.png', alt: 'Old' }]);
	const uploads: string[] = []; let mediaIds: string[] = [];
	const publicFetch = async (url: string, init?: RequestInit) => {
		if (url.endsWith('/api/v2/media')) { uploads.push(String((init?.body as FormData).get('description'))); return Response.json({ id: `m${uploads.length}`, url: 'https://files/x' }); }
		mediaIds = new URLSearchParams(String(init?.body)).getAll('media_ids[]');
		return Response.json({ url: 'https://social.coop/@caseyg/1' });
	};
	const publication = await publicationForPost(post, config.me);
	// Only the second photo goes, with new alt text.
	const result = await sendEditorDrafts(config, post, publication.revision, ['mastodon'], { mastodon: 'Two photos' }, { publicFetch, gitFetch, photos: [{ url: 'https://files.example.com/b.png', alt: 'A tall photo', post: 0 }] });
	expect(result).toContain('Mastodon sent');
	expect(uploads).toEqual(['A tall photo']); expect(mediaIds).toEqual(['m1']);
	const saved = readDocument(content).properties;
	expect(saved.photo).toEqual(['https://files.example.com/a.png', { url: 'https://files.example.com/b.png', alt: 'A tall photo' }]);
	expect(saved.syndication).toEqual(['https://social.coop/@caseyg/1']);
	expect(message).toBe('Record syndication links and photo alt text');

	// Alt text too long for Mastodon is refused before anything is read or posted.
	const fresh = parsePost(markdown, 'photos', '2026-11-06-other.md');
	await expect(sendEditorDrafts(config, fresh, (await publicationForPost(fresh, config.me)).revision, ['mastodon'], { mastodon: 'x' }, { publicFetch: async () => { throw Error('must not send'); }, gitFetch, photos: [{ url: 'https://files.example.com/a.png', alt: 'x'.repeat(1600) }] })).rejects.toMatchObject({ status: 422 });
});
