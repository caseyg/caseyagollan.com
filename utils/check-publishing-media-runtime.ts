/** Manual integration check: requires local sockets; no remote bindings or real tokens. */
import { Miniflare } from 'miniflare';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const dir = await mkdtemp(join(tmpdir(), 'publishing-media-runtime-'));
let runtime: Miniflare | undefined;
try {
  const entry = join(dir, 'worker.ts');
  await writeFile(entry, `
    import { createMediaHandler, serveMedia } from ${JSON.stringify(resolve('src/lib/server/publishing/media.ts'))};
    import { enqueueDelivery, processOutbox } from ${JSON.stringify(resolve('src/lib/server/publishing/outbox.ts'))};
    let deliveries = 0;
    const config = { me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect' };
    export default { async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/test/outbox') {
        const event = {source:'https://example.com/post/',revision:'a'.repeat(64),action:'publish',targets:[],syndicateTo:[],text:'test',published:'2026-11-06T12:00:00Z'};
        const id = await enqueueDelivery(env.STATE,event);
        const handle = async (job, checkpoint) => { deliveries++; job.progress.webmentions.push('https://example.org/'); await checkpoint(job.progress); return 'done'; };
        await Promise.all([processOutbox(env.STATE,handle),processOutbox(env.STATE,handle)]);
        const stored = await (await env.STATE.get('private/outbox/'+id+'.json')).json();
        await enqueueDelivery(env.STATE,event);
        await processOutbox(env.STATE,handle);
        return Response.json({deliveries,status:stored.status,checkpoint:stored.progress.webmentions});
      }
      if (url.pathname.startsWith('/media/')) return serveMedia(request, url.pathname.slice(7), env.MEDIA);
      return createMediaHandler(config, env.MEDIA, { fetcher: async () => Response.json({ active: true, me: config.me, scope: 'media' }) })(request);
    }};
  `);
  const built = await Bun.build({ entrypoints: [entry], target: 'browser' });
  if (!built.success) throw new Error(built.logs.join('\n'));
  runtime = new Miniflare({ modules: true, compatibilityDate: '2025-01-19', script: await built.outputs[0].text(), r2Buckets: ['MEDIA', 'STATE'] });
  const outbox = await (await runtime.dispatchFetch('http://localhost/test/outbox')).json() as {deliveries:number;status:string;checkpoint:string[]};
  assert.equal(outbox.deliveries,1); assert.equal(outbox.status,'done'); assert.deepEqual(outbox.checkpoint,['https://example.org/']);
  console.log('PASS: real R2 outbox conditional create, competing CAS leases, checkpoints and completion deduplication');
  const png = new Uint8Array([137,80,78,71,13,10,26,10,0,1,2,3]);
  const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  // Serialize multipart with the host implementation, then parse/store in real workerd/R2.
  const encoded = new Request('http://localhost/micropub/media', { method: 'POST', body: form });
  const response = await runtime.dispatchFetch(encoded.url, { method: 'POST', headers: { 'Content-Type': encoded.headers.get('Content-Type')!, Authorization: 'Bearer test-only' }, body: await encoded.arrayBuffer() });
  assert.equal(response.status, 201, await response.text());
  const location = response.headers.get('Location')!;
  const served = await runtime.dispatchFetch(location);
  assert.equal(served.status, 200); assert.deepEqual(new Uint8Array(await served.arrayBuffer()), png);
  const range = await runtime.dispatchFetch(location, { headers: { Range: 'bytes=2-5' } });
  assert.equal(range.status, 206); assert.equal(range.headers.get('Content-Range'), 'bytes 2-5/12'); assert.deepEqual(new Uint8Array(await range.arrayBuffer()), png.slice(2,6));
  const head = await runtime.dispatchFetch(location, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const conditional = await runtime.dispatchFetch(location, { headers: { 'If-None-Match': head.headers.get('ETag')! } }); assert.equal(conditional.status, 304);
  const large = new Uint8Array(25 * 1024 * 1024); large.set(png);
  const largeForm = new FormData(); largeForm.append('file', new Blob([large], { type: 'image/png' }), 'large.png');
  const largeRequest = new Request('http://localhost/micropub/media', { method: 'POST', body: largeForm });
  const largeUpload = await runtime.dispatchFetch(largeRequest.url, { method: 'POST', headers: { 'Content-Type': largeRequest.headers.get('Content-Type')!, Authorization: 'Bearer test-only' }, body: await largeRequest.arrayBuffer() });
  assert.equal(largeUpload.status, 201, await largeUpload.text());
  const largeHead = await runtime.dispatchFetch(largeUpload.headers.get('Location')!, { method: 'HEAD' }); assert.equal(largeHead.headers.get('Content-Length'), String(large.length));
  console.log('PASS: workerd multipart upload (including 25 MiB), real R2 storage, public read, byte range, HEAD, conditional GET');
} finally {
  await runtime?.dispose(); await rm(dir, { recursive: true, force: true });
}
