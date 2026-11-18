import { createMicropubHandler, type PublishingConfig } from '../../src/lib/server/publishing/micropub';

/** A Micropub endpoint backed by an in-memory Git store and token introspection; nothing leaves the test. */
export const config: PublishingConfig = {
  me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect', introspectionToken: 'server-secret',
  owner: 'caseyg', repo: 'test-content', branch: 'test', token: 'git-secret', timeZone: 'America/New_York'
};
const b64 = (value: string) => btoa(Array.from(new TextEncoder().encode(value), x => String.fromCharCode(x)).join(''));
const unb64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), x => x.charCodeAt(0)));

export function setup(scope = 'create update delete undelete', options: Partial<PublishingConfig> = {}, snapshotFetcher?: (url: string) => Promise<Response>) {
  const files = new Map<string, { content: string; sha: string }>();
  let writes = 0;
  let reads = 0;
  const handler = createMicropubHandler({ ...config, ...options }, {
    now: () => new Date('2026-11-06T17:00:00Z'), id: () => 'abc123', snapshotFetcher,
    fetcher: async (url, init) => {
      if (url === config.introspectionEndpoint) return new URLSearchParams(init.body as string).get('token') === 'invalid' ? Response.json({ active: false }) : Response.json({ active: true, me: config.me, client_id: 'https://quill.example/', scope });
      if (url.includes('/git/ref/')) return Response.json({ object: { sha: `head-${writes}` } });
      if (url.includes('/git/trees/')) return Response.json({ truncated: false, tree: [...files.keys()].map(path => ({ type: 'blob', path })) });
      if (url === 'https://api.github.com/graphql' && JSON.parse(init.body as string).query.startsWith('query Read')) {
        reads++;
        const { variables } = JSON.parse(init.body as string);
        const repository: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(variables as Record<string, string>)) {
          if (!key.startsWith('e')) continue;
          const file = files.get(value.slice(value.indexOf(':') + 1));
          repository[`f${key.slice(1)}`] = file ? { oid: file.sha, text: file.content, isBinary: false, isTruncated: false } : null;
        }
        return Response.json({ data: { repository } });
      }
      if (url === 'https://api.github.com/graphql') {
        const input = JSON.parse(init.body as string).variables.input;
        if (input.expectedHeadOid !== `head-${writes}`) return Response.json({ errors: [{ type: 'STALE_DATA' }] });
        for (const file of input.fileChanges.additions) files.set(file.path, { content: unb64(file.contents), sha: `revision-${writes + 1}` });
        for (const file of input.fileChanges.deletions ?? []) files.delete(file.path);
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
  return { handler, files, send, query, writes: () => writes, reads: () => reads };
}

/** An R2 bucket kept in memory, for media uploads. */
export function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const bucket = {
    async put(key: string, data: ArrayBuffer, options: { httpMetadata?: { contentType?: string } }) {
      if (objects.has(key)) return null;
      objects.set(key, { bytes: new Uint8Array(data), type: options.httpMetadata?.contentType ?? '' });
      return { key };
    }
  } as unknown as R2Bucket;
  return { bucket, objects };
}
