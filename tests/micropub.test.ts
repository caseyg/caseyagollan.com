import { describe, expect, test } from 'bun:test';
import { createMicropubHandler, type PublishingConfig } from '../src/lib/server/publishing/micropub';
import { readDocument } from '../src/lib/server/publishing/document';

const config: PublishingConfig = {
  me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect', introspectionToken: 'server-secret',
  owner: 'caseyg', repo: 'test-content', branch: 'test', token: 'git-secret', timeZone: 'America/New_York'
};
const b64 = (value: string) => btoa(Array.from(new TextEncoder().encode(value), x => String.fromCharCode(x)).join(''));
const unb64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), x => x.charCodeAt(0)));

function setup(scope = 'create update delete undelete', options: Partial<PublishingConfig> = {}, snapshotFetcher?: (url: string) => Promise<Response>) {
  const files = new Map<string, { content: string; sha: string }>();
  let writes = 0;
  const handler = createMicropubHandler({ ...config, ...options }, {
    now: () => new Date('2026-11-06T17:00:00Z'), id: () => 'abc123', snapshotFetcher,
    fetcher: async (url, init) => {
      if (url === config.introspectionEndpoint) return Response.json({ active: true, me: config.me, client_id: 'https://quill.example/', scope });
      if (url.includes('/git/ref/')) return Response.json({ object: { sha: `head-${writes}` } });
      if (url === 'https://api.github.com/graphql') {
        const input = JSON.parse(init.body as string).variables.input;
        if (input.expectedHeadOid !== `head-${writes}`) return Response.json({ errors: [{ type: 'STALE_DATA' }] });
        for (const file of input.fileChanges.additions) files.set(file.path, { content: unb64(file.contents), sha: `revision-${writes + 1}` });
        return Response.json({ data: { createCommitOnBranch: { commit: { oid: `commit-${++writes}` } } } });
      }
      const path = decodeURIComponent(new URL(url).pathname.split('/contents/')[1]);
      if (init.method === 'PUT') {
        const value = JSON.parse(init.body as string);
        if (files.get(path)?.sha !== value.sha) return new Response(null, { status: 409 });
        const sha = `revision-${++writes}`;
        files.set(path, { content: unb64(value.content), sha });
        return Response.json({ content: { sha }, commit: { sha: `commit-${writes}` } });
      }
      const file = files.get(path);
      return file ? Response.json({ type: 'file', path, sha: file.sha, encoding: 'base64', content: b64(file.content) }) : new Response(null, { status: 404 });
    }
  });
  const send = (body: unknown) => handler(new Request('https://example.com/micropub', { method: 'POST', headers: { Authorization: 'Bearer client', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const query = (value: string) => handler(new Request(`https://example.com/micropub?${value}`, { headers: { Authorization: 'Bearer client' } }));
  return { handler, files, send, query, writes: () => writes };
}

describe('Micropub HTTP flow', () => {
  test('is disabled without explicit configuration; preflight does not authorize writes', async () => {
    expect((await createMicropubHandler(undefined)(new Request('https://example.com/micropub'))).status).toBe(503);
    const { handler } = setup();
    const response = await handler(new Request('https://example.com/micropub', { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect((await handler(new Request('https://example.com/micropub?q=config'))).status).toBe(401);
  });

  test('creates a public note in Git with local date and canonical Location', async () => {
    const app = setup();
    const response = await app.send({ type: ['h-entry'], properties: { content: ['Hello *literal* moon'], 'mp-slug': ['hello'] } });
    expect(response.status).toBe(202);
    expect(response.headers.get('Location')).toBe('https://example.com/2026/11/06/hello/');
    const saved = app.files.get('notes/2026-11-06-hello.md');
    expect(saved).toBeDefined();
    expect(readDocument(saved!.content).properties.published).toEqual(['2026-11-06T12:00:00-05:00']);
    expect(readDocument(saved!.content).properties.content).toEqual(['Hello *literal* moon']);
  });

  test('accepts repeated form values and a single body token', async () => {
    const app = setup();
    const response = await app.handler(new Request('https://example.com/micropub', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'h=entry&content=Hello&category[]=one&category[]=two&mp-slug=form&access_token=client' }));
    expect(response.status).toBe(202);
    expect(readDocument(app.files.get('notes/2026-11-06-form.md')!.content).properties.category).toEqual(['one', 'two']);
  });

  test('returns configuration without advertising unimplemented media or syndication', async () => {
    const response = await setup().query('q=config');
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('media-endpoint');
    expect(body['syndicate-to']).toEqual([]);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  test('reads source directly from Git, supports filters, and edits all mixed operations', async () => {
    const app = setup();
    await app.send({ type: ['h-entry'], properties: { content: ['Original'], category: ['one'], 'mp-slug': ['edit'] } });
    const url = 'https://example.com/2026/11/06/edit/';
    const edited = await app.send({ action: 'update', url, replace: { content: ['Changed'] }, add: { category: ['two'] }, delete: { category: ['one'] } });
    expect(edited.status).toBe(204);
    const response = await app.query(`q=source&url=${encodeURIComponent(url)}&properties[]=content&properties[]=category`);
    expect(await response.json()).toEqual({ properties: { content: ['Changed'], category: ['two'] } });
  });

  test('soft-deletes and restores the same URL and rejects edits while deleted', async () => {
    const app = setup();
    await app.send({ properties: { content: ['Keep me'], 'mp-slug': ['restore'] } });
    const url = 'https://example.com/2026/11/06/restore/';
    expect((await app.send({ action: 'delete', url })).status).toBe(204);
    expect(readDocument(app.files.get('notes/2026-11-06-restore.md')!.content).properties.deleted).toEqual([true]);
    expect((await app.send({ action: 'update', url, replace: { content: ['no'] } })).status).toBe(410);
    expect((await app.send({ action: 'undelete', url })).status).toBe(204);
    expect(readDocument(app.files.get('notes/2026-11-06-restore.md')!.content).properties.deleted).toBeUndefined();
  });

  test('restores with IndieKit delete scope but not create/update alone', async () => {
    const app = setup('create update delete');
    await app.send({ properties: { content: ['Restore'], 'mp-slug': ['restore-delete-scope'] } });
    const url = 'https://example.com/2026/11/06/restore-delete-scope/';
    expect((await app.send({ action: 'delete', url })).status).toBe(204);
    expect((await app.send({ action: 'undelete', url })).status).toBe(204);
    expect(readDocument(app.files.get('notes/2026-11-06-restore-delete-scope.md')!.content).properties.deleted).toBeUndefined();
    for (const scope of ['create', 'update', 'undelete']) {
      const denied = setup(scope);
      expect((await denied.send({ action: 'undelete', url })).status).toBe(403);
      expect(denied.writes()).toBe(0);
    }
  });

  test('advertises configured media and saves photos/video with alt text', async () => {
    const fetcher = async () => Response.json({ active: true, me: config.me, scope: 'create' });
    const handler = createMicropubHandler({ ...config, mediaEnabled: true }, { fetcher });
    const response = await handler(new Request('https://preview.example/micropub?q=config', { headers: { Authorization: 'Bearer client' } }));
    expect((await response.json() as any)['media-endpoint']).toBe('https://preview.example/micropub/media');
    for (const property of ['photo', 'video']) {
      const app = setup();
      const value = { value: `https://example.com/media/test.${property === 'photo' ? 'png' : 'mp4'}`, alt: 'A moon' };
      const created = await app.send({ properties: { [property]: [value], 'mp-slug': [property] } });
      expect(created.status).toBe(202);
      expect(readDocument(app.files.get(`${property === 'photo' ? 'photos' : 'videos'}/2026-11-06-${property}.md`)!.content).properties[property]).toEqual([value]);
    }
  });

  test('preserves Quill form photo alt text', async () => {
    const app = setup();
    const response = await app.handler(new Request('https://example.com/micropub', { method: 'POST', headers: { Authorization: 'Bearer client', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'h=entry&photo[]=https%3A%2F%2Fexample.com%2Fmedia%2Fa.png&mp-photo-alt[]=Moon&mp-slug=quill-photo' }));
    expect(response.status).toBe(202);
    expect(readDocument(app.files.get('photos/2026-11-06-quill-photo.md')!.content).properties.photo).toEqual([{ value: 'https://example.com/media/a.png', alt: 'Moon' }]);
  });

  test('stores sanitized HTML as HTML and nonconfidential drafts outside public readers', async () => {
    const app = setup('draft create update delete');
    const draft = await app.send({ properties: { content: [{ html: '<p class="e-content">Hello <strong>moon</strong><script>bad()</script></p>' }], 'post-status': ['draft'], 'mp-slug': ['html-draft'] } });
    expect(draft.status).toBe(202);
    const url = 'https://example.com/2026/11/06/html-draft/';
    const doc = readDocument(app.files.get('notes/2026-11-06-html-draft.md')!.content);
    expect(doc.bodyFormat).toBe('html'); expect(doc.body).toContain('<strong>moon</strong>'); expect(doc.body).not.toContain('<script');
    expect(doc.properties['post-status']).toEqual(['draft']);
    expect((await app.send({ action: 'update', url, replace: { 'post-status': ['published'] } })).status).toBe(204);
    expect(readDocument(app.files.get('notes/2026-11-06-html-draft.md')!.content).properties['post-status']).toEqual(['published']);
    const denied = setup('create update');
    expect((await denied.send({ properties: { content: ['Draft'], 'post-status': ['draft'] } })).status).toBe(403);
  });

  test('returns source revision and rejects stale If-Match updates', async () => {
    const app = setup();
    await app.send({ properties: { content: ['Original'], 'mp-slug': ['revision'] } });
    const url = 'https://example.com/2026/11/06/revision/';
    const source = await app.query(`q=source&url=${encodeURIComponent(url)}`);
    expect(source.headers.get('ETag')).toBe('"revision-1"');
    const response = await app.handler(new Request('https://example.com/micropub', { method: 'POST', headers: { Authorization: 'Bearer client', 'Content-Type': 'application/json', 'If-Match': '"old-revision"' }, body: JSON.stringify({ action: 'update', url, replace: { content: ['Lost edit'] } }) }));
    expect(response.status).toBe(412); expect(app.writes()).toBe(1);
  });

  test('cannot publish a draft by deleting its status with update scope alone', async () => {
    const app = setup('update');
    app.files.set('notes/2026-11-06-draft.md', { sha: 'draft', content: '---\ndate: 2026-11-06T12:00:00-05:00\npost-status: draft\n---\nDraft' });
    expect((await app.send({ action: 'update', url: 'https://example.com/2026/11/06/draft/', delete: ['post-status'] })).status).toBe(403);
    expect(app.writes()).toBe(0);
  });

  test('advertises configured destinations and durably queues requested syndication after a Git save', async () => {
    const jobs: any[] = [];
    const state = { get: async () => null, put: async (key: string, value: string) => { if (key.startsWith('private/outbox/')) jobs.push(JSON.parse(value)); return { etag: 'one' }; } } as unknown as R2Bucket;
    const app = setup('create update', { state, syndication: { mastodon: { instance: 'https://social.example.org', token: 'test' }, bluesky: { service: 'https://bsky.social', identifier: 'casey.test', password: 'test' } } });
    const targets = (await (await app.query('q=syndicate-to')).json() as any)['syndicate-to'];
    expect(targets).toHaveLength(2);
    expect((await app.send({ properties: { content: ['Hello'], 'mp-slug': ['syndicate'] }, 'mp-syndicate-to': [targets[0].uid] })).status).toBe(202);
    expect(app.writes()).toBe(1); expect(jobs).toHaveLength(1); expect(jobs[0].event.syndicateTo).toEqual(['mastodon']);
    const url = 'https://example.com/2026/11/06/syndicate/';
    expect((await app.send({ action: 'update', url, 'mp-syndicate-to': [targets[1].uid] })).status).toBe(204);
    expect(jobs.at(-1).event.syndicateTo).toEqual(['mastodon', 'bluesky']);
    expect((await (await app.query(`q=source&url=${encodeURIComponent(url)}`)).json() as any).properties).not.toHaveProperty('syndicationTargets');
  });

  test('restoration creates a fresh Webmention transition despite matching public content', async () => {
    const jobs: any[] = [];
    const state = { get: async () => null, put: async (key: string, value: string) => { if (key.startsWith('private/outbox/')) jobs.push(JSON.parse(value)); return { etag: 'one' }; } } as unknown as R2Bucket;
    const app = setup('create update delete', { state });
    await app.send({ properties: { content: ['https://target.example.org/post'], 'mp-slug': ['transition'] } });
    const url = 'https://example.com/2026/11/06/transition/';
    await app.send({ action: 'delete', url }); await app.send({ action: 'undelete', url });
    expect(jobs).toHaveLength(3);
    expect(jobs[0].event.revision).toBe(jobs[2].event.revision);
    expect(jobs[0].event.generation).not.toBe(jobs[2].event.generation);
  });

  test('finds legacy UTC filenames and returns rendered source for Markdown', async () => {
    const app = setup();
    app.files.set('articles/2026-11-07-old.md', { sha: 'legacy', content: '---\ndate: 2026-11-06T23:30:00-05:00\ntitle: Old\n---\n**Markdown**' });
    const response = await app.query('q=source&url=https%3A%2F%2Fexample.com%2F2026%2F11%2F06%2Fold%2F');
    expect(response.status).toBe(200);
    expect((await response.json() as any).properties.content[0].html).toContain('<strong>Markdown</strong>');
  });

  test('rejects conflicts and foreign/unsafe URLs without writes', async () => {
    const app = setup();
    await app.send({ properties: { content: ['first'], 'mp-slug': ['same'] } });
    expect((await app.send({ properties: { name: ['Article'], 'mp-slug': ['same'] } })).status).toBe(409);
    for (const url of ['https://evil.example/2026/11/06/same/', 'https://example.com/2026/02/30/same/', 'https://example.com/2026/11/06/same/?x=1']) {
      expect((await app.send({ action: 'delete', url })).status).toBe(400);
    }
    expect(app.writes()).toBe(1);
  });

  test('rejects unsupported input and scopes rather than dropping data', async () => {
    const app = setup('create');
    const properties = [ { visibility: ['private'], content: ['Private'] }, { content: [{ html: '<p>x</p>', unexpected: 'bad' }] }, { content: ['x'], 'mp-syndicate-to': ['https://social.example/'] }, { content: ['x'], 'mp-slug': ['../bad'] }, { published: ['2026-02-30T12:00:00Z'], content: ['x'] } ];
    for (const p of properties) expect((await app.send({ properties: p })).status).toBe(400);
    expect((await app.send({ type: ['h-event'], properties: { name: ['Event'] } })).status).toBe(400);
    expect((await app.send({ action: 'delete', url: 'https://example.com/2026/11/06/x/' })).status).toBe(403);
    expect(app.writes()).toBe(0);
  });

  test('bounds request bodies and rejects duplicated tokens and malformed JSON', async () => {
    const app = setup();
    for (const body of ['{', JSON.stringify({ properties: { content: ['x'.repeat(131073)] } })]) {
      const response = await app.handler(new Request('https://example.com/micropub', { method: 'POST', headers: { Authorization: 'Bearer client', 'Content-Type': 'application/json' }, body }));
      expect([400, 413]).toContain(response.status);
    }
    expect((await app.handler(new Request('https://example.com/micropub', { method: 'POST', headers: { Authorization: 'Bearer client', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'content=Hello&access_token=duplicate' }))).status).toBe(400);
    expect(app.writes()).toBe(0);
  });

  test('does not truncate invalid publication dates or reject whole-property deletion', async () => {
    const app = setup();
    for (const published of [[], null, ['2026-11-06T12:00:00Z', '2026-11-07T12:00:00Z']]) {
      expect((await app.send({ properties: { content: ['x'], published } })).status).toBe(400);
    }
    await app.send({ properties: { content: ['Delete body'], 'mp-slug': ['body'] } });
    expect((await app.send({ action: 'update', url: 'https://example.com/2026/11/06/body/', delete: ['content'] })).status).toBe(204);
    expect(readDocument(app.files.get('notes/2026-11-06-body.md')!.content).body).toBe('');
    const source = await app.query('q=source&url=https%3A%2F%2Fexample.com%2F2026%2F11%2F06%2Fbody%2F');
    expect((await source.json() as any).properties).not.toHaveProperty('content');
  });

  test('only one simultaneous create can claim a URL across content folders', async () => {
    const app = setup();
    const results = await Promise.all([
      app.send({ properties: { content: ['Note'], 'mp-slug': ['race'] } }),
      app.send({ properties: { name: ['Article'], content: ['Body'], 'mp-slug': ['race'] } })
    ]);
    expect(results.map(r => r.status).sort()).toEqual([202, 409]);
    expect(app.files.size).toBe(1);
  });
});

describe('Quill structured posts', () => {
  const cases = [
    ['like', 'h-entry', { 'like-of': ['https://other.example/one'] }],
    ['repost', 'h-entry', { 'repost-of': ['https://other.example/two'] }],
    ['event', 'h-event', { name: ['Camp'], start: ['2026-11-01T09:00-07:00'], end: ['2026-11-02'], location: [{ type: ['h-card'], properties: { name: ['Venue'], latitude: [45.52], longitude: [-122.68] } }] }],
    ['review', 'h-review', { item: [{ type: ['h-product'], properties: { name: ['Book'], url: ['https://other.example/book'] } }], rating: [4], best: [5], content: ['Good'] }],
    ['itinerary', 'h-entry', { itinerary: [{ type: ['h-leg'], properties: { 'transit-type': ['air'], operator: ['Alaska'], number: ['123'], origin: ['PDX'], destination: ['SFO'], departure: ['2026-10-10T08:00:00-07:00'], arrival: ['2026-10-10T10:00:00-07:00'] } }] }],
    ['food', 'h-entry', { ate: [{ type: ['h-food'], properties: { name: ['Toast'] } }] }],
    ['drink', 'h-entry', { drank: [{ type: ['h-food'], properties: { name: ['Americano'] } }] }]
  ] as const;
  for (const [kind, type, properties] of cases) test(`creates and round trips ${kind}`, async () => {
    const app = setup();
    const response = await app.send({ type: [type], properties: { ...properties, 'mp-slug': [kind] } });
    expect(response.status).toBe(202);
    const source = await (await app.query(`q=source&url=${encodeURIComponent(response.headers.get('Location')!)}`)).json() as any;
    expect(source.type).toEqual([type]);
    for (const [key, value] of Object.entries(properties)) expect(source.properties[key]).toEqual(value);
  });
  test('round trips Markdown source, minute timestamps and channels', async () => {
    const app = setup();
    const response = await app.send({ properties: { content: ['**Hello**'], 'p3k-content-type': ['text/markdown'], published: ['2026-11-06T09:30-05:00'], 'mp-channel': ['notes'], 'mp-slug': ['markdown'] } });
    expect(response.status).toBe(202);
    const source = await (await app.query(`q=source&url=${encodeURIComponent(response.headers.get('Location')!)}`)).json() as any;
    expect(source.properties.content).toEqual(['**Hello**']);
    expect(source.properties['p3k-content-type']).toEqual(['text/markdown']);
    expect(source.properties['mp-channel']).toEqual(['notes']);
    expect((await (await app.query('q=channels')).json() as any).channels).toContainEqual({ uid: 'notes', name: 'Notes' });
  });
  test('updates likes without changing their permalink and rejects weight/private writes', async () => {
    const app = setup();
    const response = await app.send({ properties: { 'like-of': ['https://other.example/a'], 'mp-slug': ['like-edit'] } });
    expect(response.status).toBe(202);
    const url = response.headers.get('Location');
    expect((await app.send({ action: 'update', url, replace: { 'like-of': ['https://other.example/b'] } })).status).toBe(204);
    for (const properties of [{ weight: [{ type: ['h-measure'], properties: { num: [72.5], unit: ['kg'] } }] }, { visibility: ['private'] }]) {
      expect((await app.send({ properties: { content: ['x'], ...properties } })).status).toBe(400);
      expect((await app.send({ action: 'update', url, replace: properties })).status).toBe(400);
    }
  });
  test('rejects malformed structured data, invalid merged reviews, and unsafe URLs', async () => {
    const app = setup();
    for (const properties of [{ 'like-of': ['javascript:alert(1)'] }, { location: ['geo:999,0'], content: ['x'] }, { itinerary: [{ type: ['h-leg'], properties: { origin: ['PDX'] } }] }]) {
      expect((await app.send({ properties })).status).toBe(400);
    }
    const created = await app.send({ type: ['h-review'], properties: { item: [{ type: ['h-product'], properties: { name: ['Book'] } }], rating: [4], best: [5] } });
    expect(created.status).toBe(202);
    expect((await app.send({ action: 'update', url: created.headers.get('Location'), replace: { best: [3] } })).status).toBe(400);
  });
});

test('Markdown editing keeps source format aligned with frontend and supports value deletion', async () => {
 const app = setup();
 const created = await app.send({ properties: { content: ['**Hello**'], 'p3k-content-type': ['text/markdown'], 'mp-slug': ['format-edit'] } });
 const url = created.headers.get('Location');
 expect((await app.send({ action: 'update', url, delete: ['p3k-content-type'] })).status).toBe(204);
 expect(readDocument(app.files.get('notes/2026-11-06-format-edit.md')!.content).bodyFormat).toBe('text');
 expect((await app.send({ action: 'update', url, replace: { 'p3k-content-type': ['text/markdown'] } })).status).toBe(204);
 expect(readDocument(app.files.get('notes/2026-11-06-format-edit.md')!.content).bodyFormat).toBe('markdown');
 expect((await app.send({ action: 'update', url, delete: { content: ['**Hello**'] } })).status).toBe(204);
 const source = await (await app.query(`q=source&url=${encodeURIComponent(url!)}`)).json() as any;
 expect(source.properties.content).toBeUndefined();
});

test('sanitizes nested presentation content and keeps channel edits outside ordinary properties', async () => {
 const app = setup();
 const created = await app.send({ type: ['h-event'], 'mp-channel': ['events'], properties: { name: ['Camp'], start: ['2026-11-06'], 'slides-embed': ['<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe><script>bad()</script>'], conference: [{ type: ['h-event'], properties: { name: ['Parent'], start: ['2026-11-05'], content: [{ html: '<p>Conference<script>bad()</script></p>' }] } }] } });
 expect(created.status).toBe(202);
 const url = created.headers.get('Location');
 expect((await app.send({ action: 'update', url, 'mp-channel': ['notes'] })).status).toBe(204);
 const source = await (await app.query(`q=source&url=${encodeURIComponent(url!)}`)).json() as any;
 expect(source.properties['mp-channel']).toEqual(['notes']);
 expect(JSON.stringify(source)).not.toContain('<script');
 expect(source.properties['slides-embed'][0]).toContain('www.youtube.com/embed/abcdefghijk');
 expect((await app.send({ action: 'update', url, delete: ['start'] })).status).toBe(400);
});

test('accepts Quill conference references without event dates', async () => {
 const app = setup();
 const created = await app.send({ type: ['h-event'], properties: { name: ['Talk'], start: ['2026-11-06T09:00-05:00'], conference: [{ type: ['h-event'], properties: { name: ['Conference'], url: ['https://example.org/conference'] } }] } });
 expect(created.status).toBe(202);
});

test('saves fetched likes and reposts in the same GitHub Markdown write and preserves snapshots on edits', async () => {
 for (const [key,folder] of [['like-of','likes'],['repost-of','reposts']]) {
  const image = Uint8Array.from([137,80,78,71,13,10,26,10]);
  const uploads: string[] = [];
  const app = setup(undefined,{mediaBucket:{put:async(key:string)=>{uploads.push(key);return {key};}} as unknown as R2Bucket,mediaBaseUrl:'https://files.caseyagollan.com/'}, async url=> url.includes('getPostThread') ? Response.json({thread:{post:{author:{displayName:'Saved author',handle:'author.example',avatar:'https://cdn.example/avatar.png'},record:{text:'Saved original',createdAt:'2026-11-06T12:00:00Z'},embed:{images:[{fullsize:'https://cdn.example/image.png',alt:'Saved image'}]}}}}) : new Response(image,{headers:{'content-type':'image/png'}}));
  expect((await app.send({type:['h-entry'],properties:{[key]:['https://bsky.app/profile/author.example/post/abc'],'mp-slug':['saved']}})).status).toBe(202);
  const path = `${folder}/2026-11-06-saved.md`;
  expect(app.files.get(path)!.content).toContain('_micropubSocialSnapshots');
  expect(app.files.get(path)!.content).toContain('Saved original');
  expect(app.files.get(path)!.content).toContain('https://files.caseyagollan.com/publishing/social/');
  expect(app.files.get(path)!.content).not.toContain('base64,');
  expect(uploads).toHaveLength(2);
  expect(app.writes()).toBe(1);
  const query = await app.query('q=source&url=https://example.com/2026/11/06/saved/');
  expect(JSON.stringify(await query.json())).not.toContain('_micropubSocialSnapshots');
  expect((await app.send({action:'update',url:'https://example.com/2026/11/06/saved/',replace:{content:['My note']}})).status).toBe(204);
  expect(app.files.get(path)!.content).toContain('Saved original');
  expect((await app.send({action:'update',url:'https://example.com/2026/11/06/saved/',replace:{[key]:['https://example.net/other']}})).status).toBe(204);
  expect(app.files.get(path)!.content).not.toContain('Saved original');
 }
});
