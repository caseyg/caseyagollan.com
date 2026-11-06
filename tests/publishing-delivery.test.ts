import { describe, expect, test } from 'bun:test';
import { safePublicFetch } from '../src/lib/server/publishing/public-fetch';
import { discoverWebmention, sendWebmention, DeliveryError } from '../src/lib/server/publishing/webmention';
import { syndicate } from '../src/lib/server/publishing/syndication';

describe('public delivery', () => {
 test('rejects private URLs before network access', async () => {
  for (const url of ['http://example.com','https://127.1','https://[::1]','https://user:pass@example.com','https://x.local','https://169.254.169.254']) {
   await expect(safePublicFetch(url, {}, (() => { throw Error('network reached'); }) as unknown as typeof fetch)).rejects.toThrow();
  }
 });
 test('rejects private DNS answers and private redirects', async () => {
  let calls = 0;
  const network = (async (input: any) => { calls++; return Response.json({Status:0, Answer:[{type:1,data:'127.0.0.1'}]}); }) as typeof fetch;
  await expect(safePublicFetch('https://example.com', {}, network)).rejects.toThrow('public');
  expect(calls).toBeLessThanOrEqual(2);
 });
 test('bounds response bodies and checks every redirected host', async () => {
  let destinationCalls=0;
  const network=(async (input:any) => {
   const url=String(input);
   if(url.startsWith('https://cloudflare-dns.com/')) return Response.json({Status:0,Answer:url.includes('type=AAAA')?[]:[{type:1,data:'93.184.216.34'}]});
   destinationCalls++; return new Response('',{status:302,headers:{location:'https://127.0.0.1/private'}});
  }) as typeof fetch;
  await expect(safePublicFetch('https://example.com',{},network)).rejects.toMatchObject({retryable:false});
  expect(destinationCalls).toBe(1);
  const big=(async (input:any) => String(input).includes('dns-query')?Response.json({Status:0,Answer:[{type:1,data:'93.184.216.34'}]}):new Response('x'.repeat(1024*1024+1))) as typeof fetch;
  await expect(safePublicFetch('https://example.com',{},big)).rejects.toThrow('body limit');
 });
 test('discovers header and parser based HTML endpoints relatively', async () => {
  expect(await discoverWebmention('https://example.com/post', async () => new Response('', {headers:{link:'</mention>; rel="alternate webmention"'}}))).toBe('https://example.com/mention');
  expect(await discoverWebmention('https://example.com/post', async () => new Response('<LINK REL="webmention" href="/send?x=1&amp;y=2">'))).toBe('https://example.com/send?x=1&y=2');
 });
 test('distinguishes no endpoint and transient send failure', async () => {
  await expect(sendWebmention('https://source.com/post','https://example.com',async () => new Response(''))).rejects.toMatchObject({retryable:false});
  let calls=0;
  await expect(sendWebmention('https://source.com/post','https://example.com',async (_url,init) => {calls++; if (!init?.method) return new Response('<a rel="webmention" href="/send">'); expect(String(init.body)).toContain('source=https%3A%2F%2Fsource.com%2Fpost'); return new Response('',{status:503});})).rejects.toMatchObject({retryable:true});
  expect(calls).toBe(2);
 });
 test('Mastodon sends canonical text with stable idempotency header', async () => {
  const result = await syndicate('mastodon', {url:'https://source.com/post',text:'Hello',published:'2026-11-06T00:00:00Z',idempotencyKey:'stable'}, {mastodon:{instance:'https://mastodon.social',token:'secret'}},async (url,init) => {
   expect(url).toBe('https://mastodon.social/api/v1/statuses'); expect(new Headers(init?.headers).get('idempotency-key')).toBe('stable'); expect(String(init?.body)).toContain('https%3A%2F%2Fsource.com%2Fpost'); expect(init?.redirect).toBe('manual'); return Response.json({url:'https://mastodon.social/@casey/123'});
  }); expect(result).toBe('https://mastodon.social/@casey/123');
 });
 test('rejects unrelated Mastodon result origins and redirects',async () => {
  const post={url:'https://source.com/post',text:'Hello',published:'2026-11-06T00:00:00Z',idempotencyKey:'stable'};
  const config={mastodon:{instance:'https://mastodon.social',token:'secret'}};
  await expect(syndicate('mastodon',post,config,async()=>Response.json({url:'https://unrelated.example/post'}))).rejects.toMatchObject({retryable:false});
  await expect(syndicate('mastodon',post,config,async()=>new Response('',{status:302,headers:{location:'https://unrelated.example/'}}))).rejects.toMatchObject({retryable:false});
 });
 test('Bluesky retries overwrite the same record and byte offsets match canonical facet',async () => {
  const keys:string[]=[];
  for(let i=0;i<2;i++) await syndicate('bluesky',{url:'https://source.com/post',text:'👩🏽‍💻'.repeat(400),published:'2026-11-06T00:00:00Z',idempotencyKey:'stable'}, {bluesky:{service:'https://bsky.social',identifier:'casey.test',password:'secret'}}, async (url,init) => {
   if(url.endsWith('createSession')) return Response.json({did:'did:plc:abc',accessJwt:'token'});
   const body=JSON.parse(String(init?.body)); keys.push(body.rkey); expect(body.rkey).toMatch(/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/); expect(body.record.createdAt).toBe('2026-11-06T00:00:00Z'); expect([...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(body.record.text)].length).toBeLessThanOrEqual(300);
   const bytes=new TextEncoder().encode(body.record.text);const facet=body.record.facets[0];expect(new TextDecoder().decode(bytes.slice(facet.index.byteStart,facet.index.byteEnd))).toBe('https://source.com/post');return Response.json({uri:'at://did:plc:abc/app.bsky.feed.post/'+body.rkey});
  }); expect(keys[0]).toBe(keys[1]);
 });
});
