import { describe, expect, test } from 'bun:test';
import { createMicropubHandler, type PublishingConfig } from '../src/lib/server/publishing/micropub';
import { readDocument } from '../src/lib/server/publishing/document';

const config: PublishingConfig = {
  me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect', introspectionToken: 'server-secret',
  owner: 'caseyg', repo: 'test-content', branch: 'test', token: 'git-secret', timeZone: 'America/New_York'
};
const b64 = (value: string) => btoa(Array.from(new TextEncoder().encode(value), x => String.fromCharCode(x)).join(''));
const unb64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), x => x.charCodeAt(0)));

function setup(scope = 'create update delete undelete') {
  const files = new Map<string, { content: string; sha: string }>();
  let writes = 0;
  const handler = createMicropubHandler(config, {
    now: () => new Date('2026-11-06T17:00:00Z'), id: () => 'abc123',
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
    const properties = [ { 'post-status': ['draft'], content: ['Draft'] }, { visibility: ['private'], content: ['Private'] }, { content: [{ html: '<script>bad()</script>' }] }, { content: ['x'], 'mp-syndicate-to': ['https://social.example/'] }, { content: ['x'], 'mp-slug': ['../bad'] }, { published: ['2026-02-30T12:00:00Z'], content: ['x'] } ];
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
