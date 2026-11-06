import { describe, expect, test } from 'bun:test';
import { createMediaHandler, serveMedia, MAX_MEDIA_BYTES } from '../src/lib/server/publishing/media';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';

const config: PublishingConfig = { me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect', owner: 'caseyg', repo: 'content', branch: 'test', token: 'git', timeZone: 'America/New_York' };
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,1,2,3]);
function setup(scope = 'media', fail = false, mediaBaseUrl?: string) {
  const files = new Map<string, { data: Uint8Array; type: string }>();
  let calls = 0;
  const bucket = {
    async put(key: string, data: ArrayBuffer, options: any) {
      calls++; if (fail) throw new Error('private R2 error');
      files.set(key, { data: new Uint8Array(data), type: options.httpMetadata.contentType });
      return { key };
    },
    async head(key: string) {
      const file = files.get(key); return file ? { size: file.data.length, httpEtag: '"test-etag"', httpMetadata: { contentType: file.type } } : null;
    },
    async get(key: string, options?: any) {
      const file = files.get(key); if (!file) return null;
      const range = options?.range;
      return { size: file.data.length, httpEtag: '"test-etag"', httpMetadata: { contentType: file.type }, body: range ? file.data.slice(range.offset, range.offset + range.length) : file.data };
    }
  } as unknown as R2Bucket;
  const handler = createMediaHandler({ ...config, mediaBaseUrl }, bucket, { fetcher: async () => Response.json({ active: true, me: config.me, scope }), now: () => new Date('2026-11-06T17:00:00Z'), id: () => '11111111-1111-4111-8111-111111111111' });
  const upload = (bytes: Uint8Array<ArrayBuffer> = png, type = 'image/png', extra = false) => {
    const form = new FormData(); form.append('file', new Blob([bytes], { type }), '../../unsafe.png');
    if (extra) form.append('file', new Blob([bytes], { type }), 'other.png');
    return handler(new Request('https://preview.example/micropub/media', { method: 'POST', headers: { Authorization: 'Bearer client' }, body: form }));
  };
  return { handler, upload, bucket, files, calls: () => calls };
}

describe('publishing media', () => {
  test('stores an authenticated multipart upload with a safe generated URL and metadata', async () => {
    const app = setup(); const response = await app.upload();
    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe('https://preview.example/media/2026/11/11111111-1111-4111-8111-111111111111.png');
    const file = [...app.files.values()][0]; expect(file.data).toEqual(png); expect(file.type).toBe('image/png');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('Location');
  });
  test('returns the custom-domain URL for the exact stored object key', async () => {
    const app = setup('media', false, 'https://files.caseyagollan.com/');
    const response = await app.upload();
    expect(response.status).toBe(201);
    const url = new URL(response.headers.get('Location')!);
    expect(url.origin).toBe('https://files.caseyagollan.com');
    expect(app.files.has(url.pathname.slice(1))).toBe(true);
    expect(app.files.get(url.pathname.slice(1))!.data).toEqual(png);
  });
  test('rejects invalid public origins before storing files', async () => {
    for (const base of ['http://files.example/', 'https://user:password@files.example/', 'https://files.example/path', 'https://files.example/?token=x']) {
      const app = setup('media', false, base);
      expect((await app.upload()).status).toBe(503);
      expect(app.calls()).toBe(0);
    }
  });
  test('requires media scope and does not store unauthorized or ambiguous uploads', async () => {
    for (const scope of ['create', 'update', 'delete', '']) { const app = setup(scope); expect((await app.upload()).status).toBe(403); expect(app.calls()).toBe(0); }
    const app = setup(); expect((await app.handler(new Request('https://preview.example/micropub/media', { method: 'POST' }))).status).toBe(401);
    expect((await app.upload(png, 'image/png', true)).status).toBe(400); expect(app.calls()).toBe(0);
    expect((await app.handler(new Request('https://preview.example/micropub/media', { method: 'OPTIONS' }))).status).toBe(204);
  });
  test('rejects active files, mismatched magic, empty files, and oversized files', async () => {
    const app = setup();
    expect((await app.upload(new TextEncoder().encode('<svg/>'), 'image/svg+xml')).status).toBe(415);
    expect((await app.upload(new TextEncoder().encode('<html>bad</html>'), 'image/png')).status).toBe(415);
    expect((await app.upload(new Uint8Array(), 'image/png')).status).toBe(400);
    expect((await app.upload(new Uint8Array(MAX_MEDIA_BYTES + 1), 'image/png')).status).toBe(413);
    expect(app.calls()).toBe(0);
  });
  test('bounds chunked request bodies even without Content-Length', async () => {
    const app = setup(); let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
    const request = new Request('https://preview.example/micropub/media', { method: 'POST', headers: { Authorization: 'Bearer client', 'Content-Type': 'multipart/form-data; boundary=x' }, body: stream, duplex: 'half' } as RequestInit);
    expect((await app.handler(request)).status).toBe(413); expect(cancelled).toBe(true); expect(app.calls()).toBe(0);
  });
  test('fails closed when disabled, unbound, malformed, or R2 fails', async () => {
    expect((await createMediaHandler(undefined, undefined)(new Request('https://example.com/micropub/media'))).status).toBe(503);
    const app = setup('media', true); const failed = await app.upload(); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('private R2');
  });
  test('serves GET, HEAD, conditional and byte ranges only from publishing keys', async () => {
    const app = setup(); const uploaded = await app.upload(); const url = uploaded.headers.get('Location')!;
    const key = new URL(url).pathname.slice('/media/'.length);
    const get = (headers = {}, method = 'GET') => serveMedia(new Request(url, { method, headers }), key, app.bucket);
    const full = await get(); expect(full.status).toBe(200); expect(new Uint8Array(await full.arrayBuffer())).toEqual(png); expect(full.headers.get('Content-Type')).toBe('image/png'); expect(full.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const head = await get({}, 'HEAD'); expect(head.headers.get('Content-Length')).toBe('12'); expect(await head.text()).toBe('');
    expect((await get({ 'If-None-Match': '"test-etag"' })).status).toBe(304);
    const range = await get({ Range: 'bytes=2-5' }); expect(range.status).toBe(206); expect(range.headers.get('Content-Range')).toBe('bytes 2-5/12'); expect(new Uint8Array(await range.arrayBuffer())).toEqual(png.slice(2,6));
    const suffix = await get({ Range: 'bytes=-3' }); expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(png.slice(-3));
    expect((await get({ Range: 'bytes=100-' })).status).toBe(416);
    expect((await serveMedia(new Request(url), '../screenshots/key', app.bucket)).status).toBe(404);
  });
});
