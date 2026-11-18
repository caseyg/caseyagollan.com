import { describe, expect, test } from 'bun:test';
import { createMediaHandler } from '../src/lib/server/publishing/media';
import { readDocument } from '../src/lib/server/publishing/document';
import { config, memoryBucket, setup } from './helpers/micropub';

/**
 * The micropub.rocks test suite (https://micropub.rocks/), replayed against the
 * endpoint with an in-memory Git store and media bucket, so no post is published.
 * Test numbers match the suite's.
 */
const endpoint = 'https://example.com/micropub';
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1]);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const gif = new TextEncoder().encode('GIF89a\x01\x00\x01\x00');

function rocks(scope = 'create update delete undelete media') {
  const media = memoryBucket();
  const app = setup(scope, { mediaEnabled: true, mediaBucket: media.bucket });
  const form = (body: string, token = 'client') => app.handler(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body }));
  const multipart = (body: FormData) => app.handler(new Request(endpoint, { method: 'POST', headers: { Authorization: 'Bearer client' }, body }));
  const saved = (location: string | null) => {
    const slug = location!.split('/').at(-2);
    const entry = [...app.files].find(([path]) => path.endsWith(`-${slug}.md`));
    expect(entry).toBeDefined();
    return { path: entry![0], ...readDocument(entry![1].content) };
  };
  const source = async (url: string, extra = '') => (await app.query(`q=source&url=${encodeURIComponent(url)}${extra}`)).json() as Promise<{ type?: string[]; properties: Record<string, unknown[]> }>;
  return { ...app, media, form, multipart, saved, source };
}

async function created(response: Response): Promise<string> {
  expect([201, 202]).toContain(response.status);
  const location = response.headers.get('Location');
  expect(location).toStartWith('https://example.com/');
  return location!;
}

describe('micropub.rocks: creating posts', () => {
  test('100 creates an h-entry (form-encoded)', async () => {
    const app = rocks();
    const post = app.saved(await created(await app.form('h=entry&content=Hello+World')));
    expect(post.properties.content).toEqual(['Hello World']);
  });

  test('101 creates an h-entry with multiple categories (form-encoded)', async () => {
    const app = rocks();
    const post = app.saved(await created(await app.form('h=entry&content=Two+tags&category[]=test1&category[]=test2')));
    expect(post.properties.category).toEqual(['test1', 'test2']);
  });

  test('104 creates an h-entry with a photo referenced by URL (form-encoded)', async () => {
    const app = rocks();
    const post = app.saved(await created(await app.form(`h=entry&content=A+photo&photo=${encodeURIComponent('https://micropub.rocks/media/sunset.jpg')}`)));
    expect(post.properties.photo).toEqual(['https://micropub.rocks/media/sunset.jpg']);
  });

  test('107 creates an h-entry with one category (form-encoded)', async () => {
    const app = rocks();
    const post = app.saved(await created(await app.form('h=entry&content=One+tag&category=test1')));
    expect(post.properties.category).toEqual(['test1']);
  });

  test('200 creates an h-entry (JSON)', async () => {
    const app = rocks();
    const post = app.saved(await created(await app.send({ type: ['h-entry'], properties: { content: ['Micropub test of creating a basic h-entry'] } })));
    expect(post.properties.content).toEqual(['Micropub test of creating a basic h-entry']);
  });

  test('201 creates an h-entry with multiple categories (JSON)', async () => {
    const app = rocks();
    const post = app.saved(await created(await app.send({ type: ['h-entry'], properties: { content: ['Two categories'], category: ['test1', 'test2'] } })));
    expect(post.properties.category).toEqual(['test1', 'test2']);
  });

  test('202 creates an h-entry with HTML content (JSON)', async () => {
    const app = rocks();
    const post = app.saved(await created(await app.send({ type: ['h-entry'], properties: { content: [{ html: '<p>This post has <b>bold</b> and <i>italic</i> text.</p>' }] } })));
    expect(JSON.stringify(post)).toContain('<b>bold</b>');
  });

  test('203 creates an h-entry with a photo referenced by URL (JSON)', async () => {
    const app = rocks();
    const post = app.saved(await created(await app.send({ type: ['h-entry'], properties: { content: ['A photo'], photo: ['https://micropub.rocks/media/sunset.jpg'] } })));
    expect(post.properties.photo).toEqual(['https://micropub.rocks/media/sunset.jpg']);
  });

  test('204 creates an h-entry with a nested object (JSON), kept as a checkin', async () => {
    const app = rocks();
    const checkin = { type: ['h-card'], properties: { name: ['Los Gorditos'], url: ['https://foursquare.com/v/502c4bbde4b06e61e06d1ebf'], latitude: [45.524330801154], longitude: [-122.68068808051], 'street-address': ['922 NW Everett St'], locality: ['Portland'], region: ['OR'], 'country-name': ['United States'], 'postal-code': ['97209'] } };
    const post = app.saved(await created(await app.send({ type: ['h-entry'], properties: { published: ['2017-05-31T12:03:36-07:00'], content: ['Lunch meeting'], checkin: [checkin] } })));
    expect(post.path).toStartWith('checkins/');
    expect(post.properties.checkin).toEqual([checkin]);
  });

  test('205 creates an h-entry with a photo with alt text (JSON)', async () => {
    const app = rocks();
    const photo = { value: 'https://micropub.rocks/media/sunset.jpg', alt: 'Photo of a sunset' };
    const post = app.saved(await created(await app.send({ type: ['h-entry'], properties: { content: ['Nice sunset tonight'], photo: [photo] } })));
    expect(post.properties.photo).toEqual([photo]);
  });

  test('206 creates an h-entry with multiple photos referenced by URL (JSON)', async () => {
    const app = rocks();
    const photos = ['https://micropub.rocks/media/sunset.jpg', 'https://micropub.rocks/media/city-at-night.jpg'];
    const post = app.saved(await created(await app.send({ type: ['h-entry'], properties: { content: ['Two photos'], photo: photos } })));
    expect(post.properties.photo).toEqual(photos);
  });

  test('300 creates an h-entry with a photo (multipart)', async () => {
    const app = rocks();
    const body = new FormData();
    body.append('h', 'entry');
    body.append('content', 'Nice sunset tonight');
    body.append('photo', new File([jpeg], 'sunset.jpg', { type: 'image/jpeg' }));
    const post = app.saved(await created(await app.multipart(body)));
    expect(post.properties.photo).toHaveLength(1);
    expect(String(post.properties.photo[0])).toMatch(/^https:\/\/example\.com\/media\/\d{4}\/\d{2}\/[0-9a-f-]+\.jpg$/);
    expect(app.media.objects.size).toBe(1);
  });

  test('301 creates an h-entry with two photos (multipart)', async () => {
    const app = rocks();
    const body = new FormData();
    body.append('h', 'entry');
    body.append('content', 'Two photos');
    body.append('photo[]', new File([jpeg], 'sunset.jpg', { type: 'image/jpeg' }));
    body.append('photo[]', new File([png], 'city.png', { type: 'image/png' }));
    const post = app.saved(await created(await app.multipart(body)));
    expect(post.properties.photo).toHaveLength(2);
    expect(String(post.properties.photo[1])).toEndWith('.png');
    expect(app.media.objects.size).toBe(2);
  });
});

describe('micropub.rocks: updating posts', () => {
  async function post(app: ReturnType<typeof rocks>, properties: Record<string, unknown[]>) {
    return created(await app.send({ type: ['h-entry'], properties }));
  }

  test('400 replaces a property', async () => {
    const app = rocks();
    const url = await post(app, { content: ['This is a test post'] });
    expect((await app.send({ action: 'update', url, replace: { content: ['This is the updated text'] } })).status).toBeLessThan(300);
    expect((await app.source(url)).properties.content).toEqual(['This is the updated text']);
  });

  test('401 adds a value to an existing property', async () => {
    const app = rocks();
    const url = await post(app, { content: ['Tagged'], category: ['test1'] });
    expect((await app.send({ action: 'update', url, add: { category: ['test2'] } })).status).toBeLessThan(300);
    expect((await app.source(url)).properties.category).toEqual(['test1', 'test2']);
  });

  test('402 adds a value to a property that did not exist', async () => {
    const app = rocks();
    const url = await post(app, { content: ['Untagged'] });
    expect((await app.send({ action: 'update', url, add: { category: ['test1'] } })).status).toBeLessThan(300);
    expect((await app.source(url)).properties.category).toEqual(['test1']);
  });

  test('403 removes one value from a property', async () => {
    const app = rocks();
    const url = await post(app, { content: ['Two tags'], category: ['test1', 'remove me'] });
    expect((await app.send({ action: 'update', url, delete: { category: ['remove me'] } })).status).toBeLessThan(300);
    expect((await app.source(url)).properties.category).toEqual(['test1']);
  });

  test('404 removes a property', async () => {
    const app = rocks();
    const url = await post(app, { content: ['Two tags'], category: ['test1', 'test2'] });
    expect((await app.send({ action: 'update', url, delete: ['category'] })).status).toBeLessThan(300);
    expect((await app.source(url)).properties.category).toBeUndefined();
  });

  test('405 rejects an update whose operation is not an array', async () => {
    const app = rocks();
    const url = await post(app, { content: ['Unchanged'] });
    expect((await app.send({ action: 'update', url, replace: { content: 'This is not an array' } })).status).toBe(400);
    expect((await app.source(url)).properties.content).toEqual(['Unchanged']);
  });
});

describe('micropub.rocks: deleting posts', () => {
  test('500 deletes a post (form-encoded) and 502 undeletes it', async () => {
    const app = rocks();
    const url = await created(await app.send({ type: ['h-entry'], properties: { content: ['Delete me'] } }));
    expect((await app.form(`action=delete&url=${encodeURIComponent(url)}`)).status).toBeLessThan(300);
    expect(app.saved(url).properties.deleted).toEqual([true]);
    expect((await app.form(`action=undelete&url=${encodeURIComponent(url)}`)).status).toBeLessThan(300);
    expect(app.saved(url).properties.deleted).toBeUndefined();
  });

  test('501 deletes a post (JSON) and 503 undeletes it', async () => {
    const app = rocks();
    const url = await created(await app.send({ type: ['h-entry'], properties: { content: ['Delete me'] } }));
    expect((await app.send({ action: 'delete', url })).status).toBeLessThan(300);
    expect(app.saved(url).properties.deleted).toEqual([true]);
    expect((await app.send({ action: 'undelete', url })).status).toBeLessThan(300);
    expect(app.saved(url).properties.deleted).toBeUndefined();
  });
});

describe('micropub.rocks: queries', () => {
  test('600 answers a configuration query', async () => {
    const response = await rocks().query('q=config');
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body['media-endpoint']).toBe('https://example.com/micropub/media');
    expect(Array.isArray(body['syndicate-to'])).toBe(true);
  });

  test('601 answers a syndication target query', async () => {
    const response = await rocks().query('q=syndicate-to');
    expect(response.status).toBe(200);
    expect(Array.isArray((await response.json() as Record<string, unknown>)['syndicate-to'])).toBe(true);
  });

  test('602 returns every property of a post (source query)', async () => {
    const app = rocks();
    const url = await created(await app.send({ type: ['h-entry'], properties: { content: ['Source query'], category: ['test1', 'test2'] } }));
    const body = await app.source(url);
    expect(body.type).toEqual(['h-entry']);
    expect(body.properties.content).toEqual(['Source query']);
    expect(body.properties.category).toEqual(['test1', 'test2']);
  });

  test('603 returns only the requested properties (source query)', async () => {
    const app = rocks();
    const url = await created(await app.send({ type: ['h-entry'], properties: { content: ['Source query'], category: ['test1', 'test2'] } }));
    const body = await app.source(url, '&properties[]=content&properties[]=category');
    expect(body.type).toBeUndefined();
    expect(Object.keys(body.properties).sort()).toEqual(['category', 'content']);
  });
});

describe('micropub.rocks: media endpoint', () => {
  for (const [number, name, bytes, type] of [['700', 'a jpg', jpeg, 'image/jpeg'], ['701', 'a png', png, 'image/png'], ['702', 'a gif', gif, 'image/gif']] as const) {
    test(`${number} uploads ${name}`, async () => {
      const { bucket, objects } = memoryBucket();
      const handler = createMediaHandler({ ...config, mediaEnabled: true }, bucket, { fetcher: async () => Response.json({ active: true, me: config.me, scope: 'media' }) });
      const body = new FormData();
      body.append('file', new File([bytes], `upload.${type.split('/')[1]}`, { type }));
      const response = await handler(new Request('https://example.com/micropub/media', { method: 'POST', headers: { Authorization: 'Bearer client' }, body }));
      expect(response.status).toBe(201);
      expect(response.headers.get('Location')).toStartWith('https://example.com/media/');
      expect(objects.size).toBe(1);
    });
  }
});

describe('micropub.rocks: authentication', () => {
  test('800 accepts an access token in the Authorization header', async () => {
    await created(await rocks().form('h=entry&content=Header+token'));
  });

  test('801 accepts an access token in the POST body', async () => {
    const app = rocks();
    const response = await app.handler(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'h=entry&content=Body+token&access_token=client' }));
    await created(response);
  });

  test('802 does not store the access token as a property', async () => {
    const app = rocks();
    const response = await app.handler(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'h=entry&content=Body+token&access_token=client' }));
    const post = app.saved(await created(response));
    expect(post.properties.access_token).toBeUndefined();
    expect(JSON.stringify(post)).not.toContain('access_token');
  });

  test('803 rejects an unauthenticated request', async () => {
    const app = rocks();
    const response = await app.handler(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'h=entry&content=No+token' }));
    expect(response.status).toBe(401);
    expect(app.files.size).toBe(0);
  });

  test('804 rejects a token without the needed scope', async () => {
    const app = rocks('update');
    const response = await app.form('h=entry&content=Wrong+scope');
    expect(response.status).toBe(403);
    expect((await response.json() as { error: string }).error).toBe('insufficient_scope');
    expect(app.files.size).toBe(0);
  });

  test('805 rejects an invalid token', async () => {
    const app = rocks();
    const response = await app.form('h=entry&content=Bad+token', 'invalid');
    expect(response.status).toBe(401);
    expect(app.files.size).toBe(0);
  });

  test('stores no uploaded file when the token is rejected', async () => {
    const app = rocks('update');
    const body = new FormData();
    body.append('h', 'entry');
    body.append('photo', new File([jpeg], 'sunset.jpg', { type: 'image/jpeg' }));
    expect((await app.multipart(body)).status).toBe(403);
    expect(app.media.objects.size).toBe(0);
  });
});
