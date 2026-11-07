import { test, expect } from 'bun:test';
import { identity, indexIdentities, alreadyRepresented, activityDocument, processPesos } from '../src/lib/server/publishing/pesos/importer';
import { mastodonActivity, blueskyActivity, mastodonPage, blueskyPage, type Activity } from '../src/lib/server/publishing/pesos/providers';
import { readDocument } from '../src/lib/server/publishing/document';
import type { PesosEnvironment } from '../src/lib/server/publishing/pesos/importer';

const did = 'did:plc:abcdef';
const url = `https://bsky.app/profile/${did}/post/abc123`;
const activity: Activity = {id:`at://${did}/app.bsky.feed.like/xyz`,service:'bluesky',kind:'like',url,target:url,published:'2026-11-07T01:00:00Z',properties:{}};
const mastodon = {account:{locked:false},id:'123',url:'https://social.coop/@caseyg/123',created_at:'2026-11-07T01:00:00Z',visibility:'public',content:'<p>Hello<script>alert(1)</script></p>',media_attachments:[{type:'image',url:'https://social.coop/image.jpg',description:'An image'}]};

test('deduplication checks all existing site content, normalizes aliases, and keeps action identities separate',()=>{
 const actors = {'caseyagollan.com':did};
 const keys = indexIdentities([{properties:{'like-of':['https://bsky.app/profile/caseyagollan.com/post/abc123/']}}],actors);
 expect(alreadyRepresented(activity,keys,actors)).toBe(true);
 expect(alreadyRepresented({...activity,kind:'repost'},keys,actors)).toBe(false);
 expect(alreadyRepresented({...activity,kind:'post'},keys,actors)).toBe(false);
 const postKeys = indexIdentities([{properties:{syndication:[url]}}]);
 expect(alreadyRepresented({...activity,kind:'post'},postKeys)).toBe(true);
 expect(alreadyRepresented(activity,postKeys)).toBe(true);
 expect(alreadyRepresented({...activity,kind:'repost'},postKeys)).toBe(true);
 expect(identity('like','https://social.coop/users/caseyg/statuses/123?x=y')).toBe(identity('like',mastodon.url));
 expect(identity('like',`at://${did}/app.bsky.feed.post/abc123`)).toBe(identity('like',url));
});
test('self-likes match site permalinks and federated aliases without suppressing unrelated likes',()=>{
 const permalink = 'https://caseyagollan.com/2025/09/07/indiekit-progress/';
 const canonical = 'https://social.coop/@caseyg/115164254382519869';
 const alias = 'https://other.example/@caseyg@social.coop/456';
 const actors = {[alias]:canonical};
 const keys = indexIdentities([{permalink,properties:{syndication:[canonical]}}],actors);
 for (const target of [permalink.slice(0,-1),canonical,alias]) {
  expect(alreadyRepresented({...activity,target},keys,actors)).toBe(true);
 }
 expect(alreadyRepresented(activity,keys,actors)).toBe(false);
});
test('consolidated cross-network originals retain every source identity',()=>{
 const keys = indexIdentities([{properties:{
  syndication:[url,mastodon.url],
  'pesos-source':['mastodon:post:123',`at://${did}/app.bsky.feed.post/abc123`]
 }}]);
 expect(alreadyRepresented({...activity,kind:'post'},keys)).toBe(true);
 expect(alreadyRepresented({...activity,kind:'post',id:'mastodon:post:123',url:mastodon.url,target:undefined},keys)).toBe(true);
 expect(alreadyRepresented({...activity,target:mastodon.url},keys)).toBe(true);
});
test('source record identity survives changes to target URLs and deleted site entries remain represented',()=>{
 expect(alreadyRepresented(activity,indexIdentities([{properties:{'pesos-source':[activity.id],deleted:['true']}}]))).toBe(true);
});
test('imported files use current document conventions, local dates, stable slugs, and no outbound syndication request',async()=>{
 const first = await activityDocument(activity,'America/New_York');
 expect(first.path).toBe('likes/2026-11-06-abc123.md');
 expect(await activityDocument(activity,'America/New_York')).toEqual(first);
 const p = readDocument(first.content).properties;
 expect(p.published).toEqual(['2026-11-06T20:00:00-05:00']);
 expect(p['like-of']).toEqual([url]);
 expect(p['mp-syndicate-to']).toBeUndefined();
 expect(p.syndicationTargets).toBeUndefined();
 expect(p['pesos-source']).toEqual([activity.id]);
});
test('Mastodon filters non-public originals and boosts, sanitizes HTML, and preserves media alt text',()=>{
 const post = mastodonActivity(mastodon,'post','2026-11-07T00:00:00Z')!;
 expect(JSON.stringify(post.properties.content)).not.toContain('<script>');
 expect(post.properties.photo).toEqual([{url:'https://social.coop/image.jpg',alt:'An image'}]);
 expect(mastodonActivity({...mastodon,visibility:'private'},'post','now')).toBeUndefined();
 expect(mastodonActivity({...mastodon,reblog:{...mastodon,visibility:'unlisted'}},'post','now')).toBeUndefined();
 const boost = mastodonActivity({...mastodon,id:'456',reblog:mastodon},'post','now')!;
 expect(boost.kind).toBe('repost'); expect(boost.target).toBe(mastodon.url);
 expect(mastodonActivity(mastodon,'like','2026-11-08T00:00:00Z')!.published).toBe(mastodon.created_at);
});
test('Bluesky reads distinct post/like/repost records and preserves facets, replies, and media',()=>{
 const record = {uri:`at://${did}/app.bsky.feed.post/abc123`,value:{createdAt:activity.published,text:'a link',facets:[{features:[{$type:'app.bsky.richtext.facet#link',uri:'https://example.com/full-link'}]}],reply:{parent:{uri:`at://${did}/app.bsky.feed.post/parent`}},embed:{$type:'app.bsky.embed.images',images:[{alt:'Alt',image:{ref:{$link:'cid'}}}]}}};
 const post = blueskyActivity(record,'post')!;
 expect(post.properties.content).toEqual(['a link\n\nhttps://example.com/full-link']);
 expect(post.properties['in-reply-to']).toEqual([`https://bsky.app/profile/${did}/post/parent`]);
 expect(post.properties.photo?.[0]).toMatchObject({alt:'Alt'});
 expect(blueskyActivity({uri:activity.id,value:{createdAt:activity.published,subject:{uri:record.uri}}},'like')!.target).toBe(url);
});
test('pagination keeps opaque Mastodon favourite IDs and traverses pages containing only non-public posts',async()=>{
 const get = async()=>({data:[{...mastodon,visibility:'private'}],link:'<https://social.coop/api/v1/favourites?max_id=999>; rel="next"'});
 const page = await mastodonPage(get,'https://social.coop','token','1','like');
 expect(page.activities).toEqual([]); expect(page.ids).toEqual(['mastodon:like:123']); expect(page.cursor).toBe('999');
 let requested = '';
 await blueskyPage(async u=>{requested=u;return {data:{records:[],cursor:'opaque'}};},'https://bsky.social',did,'repost','before');
 expect(requested).toContain('collection=app.bsky.feed.repost'); expect(requested).toContain('cursor=before');
});

function harness(options: {existing?: string; conflict?: boolean; pendingSend?: boolean; failState?: boolean} = {}) {
 const files = new Map<string,{value:string;etag:string}>(); let revision = 0;
 const bucket = {
  async get(key:string) {const file=files.get(key);return file ? {etag:file.etag,json:async()=>JSON.parse(file.value)} : null;},
  async put(key:string,value:string,opts?:{onlyIf?:{etagMatches?:string;etagDoesNotMatch?:string}}) {
   if(options.failState && key === 'private/pesos/state.json') throw new Error('state unavailable');
   const old = files.get(key); const c=opts?.onlyIf;
   if((c?.etagMatches && old?.etag !== c.etagMatches) || (c?.etagDoesNotMatch === '*' && old)) return null;
   const etag = String(++revision); files.set(key,{value,etag});return {etag};
  }
 } as unknown as R2Bucket;
 const env: PesosEnvironment = {PESOS_ENABLED:'true',PUBLISHING_ENABLED:'true',PUBLISHING_ME:'https://caseyagollan.com/',PUBLISHING_INTROSPECTION_ENDPOINT:'https://example.com/introspect',PUBLISHING_GITHUB_OWNER:'caseyg',PUBLISHING_GITHUB_REPO:'caseyagollan-content',PUBLISHING_GITHUB_BRANCH:'main',PUBLISHING_GITHUB_TOKEN:'git-secret',PUBLISHING_STATE:bucket,PUBLISHING_MASTODON_TOKEN:'mastodon-secret'};
 const writes: any[] = [];
 const blobs = new Map<string,string>();
 if (options.existing) blobs.set('initial',options.existing);
 let committed = false;
 const fetcher = (async(input: string | URL | Request,init?:RequestInit)=>{
  const u=String(input);
  if(u.includes('/git/ref/')) return Response.json({object:{sha:committed?'newhead':'head'}});
  if(u.includes('/git/trees/')) return Response.json({tree:[...blobs].map(([sha],i)=>({type:'blob',path:`notes/2026-11-06-${i}.md`,sha}))});
  if(u.includes('/git/blobs/')) {const content=blobs.get(u.split('/').pop()!)!;return Response.json({encoding:'base64',size:content.length,content:btoa(content)});}
  if(u.includes('/api/v1/statuses/')) return Response.json(mastodon);
  if(u.endsWith('/verify_credentials')) return Response.json({id:'1'});
  if(u.includes('/accounts/1/statuses')) return Response.json([mastodon]);
  if(u.includes('/favourites')) return Response.json([]);
  if(u === 'https://api.github.com/graphql') {
   const body=JSON.parse(String(init?.body)); writes.push(body);
   if(options.conflict) return Response.json({errors:[{type:'STALE_DATA'}]});
   for(const addition of body.variables.input.fileChanges.additions) blobs.set(`import${blobs.size}`,atob(addition.contents));
   committed=true;return Response.json({data:{createCommitOnBranch:{commit:{oid:'newhead'}}}});
  }
  throw new Error(`Unexpected URL ${u}`);
 }) as typeof fetch;
 return {env,bucket,files,writes,fetcher};
}
test('full import batches an atomic commit, then a retry deduplicates from live Git even after checkpoint failure',async()=>{
 const h=harness({failState:true});
 await expect(processPesos(h.env,{fetcher:h.fetcher})).rejects.toThrow('state unavailable');
 expect(h.writes).toHaveLength(1);
 expect(h.writes[0].variables.input.expectedHeadOid).toBe('head');
 await expect(processPesos(h.env,{fetcher:h.fetcher})).rejects.toThrow('state unavailable');
 expect(h.writes).toHaveLength(1);
});
test('site-originated social posts are skipped before any commit',async()=>{
 const h=harness({existing:`---\ndate: 2026-11-06T20:00:00-05:00\nsyndication:\n  - ${mastodon.url}\n---\nSite original`});
 const result=await processPesos(h.env,{fetcher:h.fetcher});
 expect(result.imported).toBe(0); expect(result.skipped).toBe(1);expect(h.writes).toHaveLength(0);
});
test('polling consolidates a cross-network original atomically and records new identities before checkpointing',async()=>{
 const text='to play in a place where there is resonance';
 const h=harness({existing:`---\n_micropubContentFormat: text\ndate: 2026-11-06T20:00:00-05:00\npesos-source: [at://did:plc:casey/app.bsky.feed.post/abc]\nsyndication: [https://bsky.app/profile/did:plc:casey/post/abc]\n---\n${text}`});
 const fetcher=(async(input,init)=>String(input).includes('/accounts/1/statuses') ? Response.json([{...mastodon,content:`<p>${text}</p>`,media_attachments:[]}]) : h.fetcher(input,init)) as typeof fetch;
 const result=await processPesos(h.env,{fetcher});
 expect(result.imported).toBe(0);expect(result.merged).toBe(1);
 expect(h.writes).toHaveLength(1);
 const commit=h.writes[0].variables.input;
 expect(commit.expectedHeadOid).toBe('head');
 expect(commit.fileChanges.additions).toHaveLength(1);
 const file=commit.fileChanges.additions[0];
 expect(file.path).toBe('notes/2026-11-06-0.md');
 const saved=readDocument(atob(file.contents));
 expect(saved.body).toBe(text);
 expect(saved.properties['pesos-source']).toEqual(['at://did:plc:casey/app.bsky.feed.post/abc','mastodon:post:123']);
 expect(saved.properties.syndication).toContain(mastodon.url);
 expect(h.files.has('private/pesos/state.json')).toBe(true);
});
test.each(['dry-run','conflict','checkpoint-retry'])('cross-network merge handles %s safely',async(mode)=>{
 const text='to play in a place where there is resonance';
 const h=harness({existing:`---\n_micropubContentFormat: text\ndate: 2026-11-06T20:00:00-05:00\npesos-source: [at://did:plc:casey/app.bsky.feed.post/abc]\n---\n${text}`,conflict:mode==='conflict',failState:mode==='checkpoint-retry'});
 const fetcher=(async(input,init)=>String(input).includes('/accounts/1/statuses') ? Response.json([{...mastodon,content:`<p>${text}</p>`,media_attachments:[]}]) : h.fetcher(input,init)) as typeof fetch;
 if (mode==='dry-run') {
  expect((await processPesos(h.env,{fetcher,dryRun:true})).merged).toBe(1);
  expect(h.writes).toHaveLength(0);expect(h.files.has('private/pesos/state.json')).toBe(false);
 } else {
  await expect(processPesos(h.env,{fetcher})).rejects.toThrow(mode==='conflict'?'conflicted':'state unavailable');
  expect(h.files.has('private/pesos/state.json')).toBe(false);
  if (mode==='checkpoint-retry') {
   await expect(processPesos(h.env,{fetcher})).rejects.toThrow('state unavailable');
   expect(h.writes).toHaveLength(1);
  }
 }
});
test('self-likes are skipped by live syndication metadata and outbound receipts',async()=>{
 for (const receipt of [false,true]) {
  const h=harness({existing:`---\ndate: 2026-11-06T20:00:00-05:00\n${receipt ? '' : `syndication: [${mastodon.url}]\n`}---\nSite original`});
  if (receipt) {
   const source='https://caseyagollan.com/2026/11/06/0/';
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${source}\0mastodon`))),b=>b.toString(16).padStart(2,'0')).join('');
   h.files.set(`private/syndication/${hash}.json`,{etag:'receipt',value:JSON.stringify({status:'sent',url:mastodon.url})});
  }
  const fetcher = (async(input,init)=>String(input).includes('/favourites') ? Response.json([mastodon]) : h.fetcher(input,init)) as typeof fetch;
  const result=await processPesos(h.env,{fetcher});
  expect(result.imported).toBe(0);
  expect(result.skipped).toBe(2);
  expect(h.writes).toHaveLength(0);
 }
});
test('a concurrent site write fails closed and leaves scan cursors unadvanced',async()=>{
 const h=harness({conflict:true});
 await expect(processPesos(h.env,{fetcher:h.fetcher})).rejects.toThrow('conflicted');
 expect(h.files.has('private/pesos/state.json')).toBe(false);
});
test('dry run previews imports without content writes or advancing source cursors',async()=>{
 const h=harness(); const result=await processPesos(h.env,{fetcher:h.fetcher,dryRun:true});
 expect(result.imported).toBe(1);expect(h.writes).toHaveLength(0);expect(h.files.has('private/pesos/state.json')).toBe(false);
});
test('disabled importer performs no network requests',async()=>{
 expect((await processPesos({}, {fetcher:async()=>{throw new Error('unexpected');}})).imported).toBe(0);
});

test('an unrecorded outbound receipt prevents a second copy of a site post',async()=>{
 const h=harness({existing:'---\ndate: 2026-11-06T20:00:00-05:00\n---\nSite original'});
 const source='https://caseyagollan.com/2026/11/06/0/';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${source}\0mastodon`))),b=>b.toString(16).padStart(2,'0')).join('');
 h.files.set(`private/syndication/${hash}.json`,{etag:'receipt',value:JSON.stringify({status:'sent',url:mastodon.url})});
 expect((await processPesos(h.env,{fetcher:h.fetcher})).imported).toBe(0);
 expect(h.writes).toHaveLength(0);
});
test('an ambiguous outbound send blocks imports until reconciled',async()=>{
 const h=harness({existing:'---\ndate: 2026-11-06T20:00:00-05:00\n---\nSite original'});
 const source='https://caseyagollan.com/2026/11/06/0/';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${source}\0mastodon`))),b=>b.toString(16).padStart(2,'0')).join('');
 h.files.set(`private/syndication/${hash}.json`,{etag:'receipt',value:JSON.stringify({status:'sending'})});
 await expect(processPesos(h.env,{fetcher:h.fetcher})).rejects.toThrow('pending reconciliation');
 expect(h.writes).toHaveLength(0);
});
test('overlapping scheduled invocations respect the conditional lease',async()=>{
 const h=harness();
 h.files.set('private/pesos/lease.json',{etag:'other',value:JSON.stringify({until:Date.now()+60_000})});
 expect((await processPesos(h.env,{fetcher:async()=>{throw new Error('must not fetch');}})).imported).toBe(0);
});
test('older-page cursors survive restarts and new pages continue to be checked during backfill',async()=>{
 const h=harness(); const cursors:string[]=[];
 const fetcher=(async(input:string|URL|Request,init?:RequestInit)=>{
  const u=String(input);
  if(u.includes('/accounts/1/statuses')) {
   const cursor=new URL(u).searchParams.get('max_id') ?? 'head';cursors.push(cursor);
   return Response.json(cursor === 'head' ? [mastodon] : [],{headers:cursor === 'head' ? {link:'<https://social.coop/api/v1/accounts/1/statuses?max_id=100>; rel="next"'} : {}});
  }
  return h.fetcher(input,init);
 }) as typeof fetch;
 await processPesos(h.env,{fetcher});
 expect(JSON.parse(h.files.get('private/pesos/state.json')!.value).feeds['mastodon:post'].pending).toEqual(['100']);
 await processPesos(h.env,{fetcher});
 expect(cursors).toEqual(['head','head','100']);expect(h.writes).toHaveLength(1);
});
test('one unavailable provider feed leaves other feeds and their imports operational',async()=>{
 const h=harness();
 const fetcher=(async(input:string|URL|Request,init?:RequestInit)=>String(input).includes('/favourites') ? new Response(null,{status:401}) : h.fetcher(input,init)) as typeof fetch;
 const result=await processPesos(h.env,{fetcher});
 expect(result.imported).toBe(1);expect(result.failedFeeds).toBe(1);expect(h.writes).toHaveLength(1);
 expect(JSON.parse(h.files.get('private/pesos/state.json')!.value).feeds['mastodon:like']).toBeUndefined();
});

test('federated Mastodon target aliases match existing likes made through the site',async()=>{
 const h=harness({existing:'---\ndate: 2026-11-06T20:00:00-05:00\nlike-of:\n - https://social.coop/@someone@remote.example.org/999\n---\n'});
 const target={...mastodon,url:'https://remote.example.org/@someone/123'};
 const fetcher=(async(input:string|URL|Request,init?:RequestInit)=>{
  const u=String(input);
  if(u.includes('/api/v1/statuses/999')) return Response.json(target);
  if(u.includes('/accounts/1/statuses')) return Response.json([]);
  if(u.includes('/favourites')) return Response.json([target]);
  return h.fetcher(input,init);
 }) as typeof fetch;
 const result=await processPesos(h.env,{fetcher});
 expect(result.imported).toBe(0);expect(result.skipped).toBe(1);expect(h.writes).toHaveLength(0);
});
test('a social caption syndicated from a site like is not imported as a new note',()=>{
 const keys=indexIdentities([{properties:{'like-of':['https://example.org/original'],syndication:[mastodon.url]}}]);
 expect(alreadyRepresented(mastodonActivity(mastodon,'post','now')!,keys)).toBe(true);
});
test('imported likes retain the target relationship without claiming its URL as our syndicated copy',async()=>{
 const file=await activityDocument(activity,'America/New_York');
 expect(readDocument(file.content).properties.syndication).toBeUndefined();
});
test('Bluesky imports public repository records without a password or authenticated session',async()=>{
 const h=harness();h.env.PUBLISHING_MASTODON_TOKEN=undefined;h.env.PUBLISHING_BLUESKY_IDENTIFIER='caseyagollan.com';
 const fetcher=(async(input:string|URL|Request,init?:RequestInit)=>{
  const u=String(input);
  if(u.includes('resolveHandle')) return Response.json({did});
  if(u.includes('getPostThread')) return Response.json({thread:{$type:'app.bsky.feed.defs#threadViewPost',post:{uri:new URL(u).searchParams.get('uri'),record:{text:'Public post'},author:{did}}}});
  if(u.includes('getProfile')) return Response.json({did});
  if(u.includes('listRecords')) {
   expect(init?.headers).not.toHaveProperty('Authorization');
   const collection=new URL(u).searchParams.get('collection');
   return Response.json({records:collection === 'app.bsky.feed.post' ? [{uri:`at://${did}/app.bsky.feed.post/abc123`,value:{createdAt:activity.published,text:'Public post'}}] : []});
  }
  return h.fetcher(input,init);
 }) as typeof fetch;
 expect((await processPesos(h.env,{fetcher})).imported).toBe(1);expect(h.writes).toHaveLength(1);
});
test('a large post backfill leaves capacity for new activity in other feeds',async()=>{
 const h=harness();h.env.PUBLISHING_BLUESKY_IDENTIFIER='caseyagollan.com';
 const fetcher=(async(input:string|URL|Request,init?:RequestInit)=>{
  const u=String(input);
  if(u.includes('/accounts/1/statuses')) return Response.json(Array.from({length:40},(_,i)=>({...mastodon,id:String(1000+i),url:`https://social.coop/@caseyg/${1000+i}`})));
  if(u.includes('resolveHandle')) return Response.json({did});
  if(u.includes('getPostThread')) return Response.json({thread:{$type:'app.bsky.feed.defs#threadViewPost',post:{uri:new URL(u).searchParams.get('uri'),record:{text:'Public post'},author:{did}}}});
  if(u.includes('getProfile')) return Response.json({did});
  if(u.includes('listRecords')) return Response.json({records:new URL(u).searchParams.get('collection') === 'app.bsky.feed.post' ? [{uri:`at://${did}/app.bsky.feed.post/newest`,value:{createdAt:activity.published,text:'New Bluesky post'}}] : []});
  return h.fetcher(input,init);
 }) as typeof fetch;
 const result=await processPesos(h.env,{fetcher});
 expect(result.imported).toBe(3);
 const additions=h.writes[0].variables.input.fileChanges.additions;
 expect(additions.some((a:any)=>atob(a.contents).includes('New Bluesky post'))).toBe(true);
});

 test('slugs use original post IDs for Mastodon likes and reposts and avoid cross-folder collisions',async()=>{
 const like = {...activity,service:'mastodon' as const,url:mastodon.url,target:mastodon.url};
 expect((await activityDocument(like,'America/New_York')).path).toBe('likes/2026-11-06-123.md');
 expect((await activityDocument({...like,kind:'repost'},'America/New_York',['likes/2026-11-06-123.md'])).path).toBe('reposts/2026-11-06-123-repost.md');
 expect((await activityDocument(activity,'America/New_York',['notes/2026-11-06-abc123.md'])).path).toBe('likes/2026-11-06-abc123-like.md');
 });

test('renamed captured posts refresh cached paths and permalinks without importing again',async()=>{
 const existing = `---\ndate: 2026-11-06T20:00:00-05:00\npesos-source: [mastodon:post:123]\nsyndication: [${mastodon.url}]\n---\nSaved`;
 const h = harness({existing});
 const old = {path:'notes/2026-11-06-pesos-old.md',sha:'initial',properties:readDocument(existing).properties,permalink:'https://caseyagollan.com/2026/11/06/pesos-old/'};
 await h.bucket.put('private/pesos/index/initial.json',JSON.stringify(old));
 const result = await processPesos(h.env,{fetcher:h.fetcher});
 expect(result.imported).toBe(0);
 expect(h.writes).toHaveLength(0);
 const cached = JSON.parse(h.files.get('private/pesos/index/initial.json')!.value);
 expect(cached.path).toBe('notes/2026-11-06-0.md');
 expect(cached.permalink).toBe('https://caseyagollan.com/2026/11/06/0/');
 expect(cached.properties['pesos-source']).toEqual(['mastodon:post:123']);
});

test('Mastodon interactions require public visibility and an explicitly unlocked original author',()=>{
 for (const kind of ['like','post'] as const) for (const visibility of ['public','unlisted','private','direct',undefined]) for (const locked of [true,false,undefined]) {
  const original = {...mastodon,visibility,account:locked === undefined ? undefined : {locked}};
  const status = kind === 'post' ? {...mastodon,id:'boost',reblog:original} : original;
  expect(!!mastodonActivity(status,kind,activity.published)).toBe(visibility === 'public' && locked === false);
 }
});

test('Bluesky interactions validate public target and author before importing, retaining pagination for skipped records',async()=>{
 for (const kind of ['like','repost'] as const) for (const restriction of ['none','missing','blocked','post-label','author-label','profile-label','private','deleted','unavailable']) {
  const record = {uri:`at://${did}/app.bsky.feed.${kind}/xyz`,value:{createdAt:activity.published,subject:{uri:`at://${did}/app.bsky.feed.post/abc123`}}};
  const post:any = {uri:record.value.subject.uri,record:{text:'Target'},author:{did}};
  const profile:any = {did};
  if(restriction === 'post-label') post.labels = [{val:'!no-unauthenticated'}];
  if(restriction === 'author-label') post.author.labels = [{val:'!no-unauthenticated'}];
  if(restriction === 'profile-label') profile.labels = [{val:'!no-unauthenticated'}];
  if(restriction === 'private') profile.private = true;
  const get = async(u:string,headers?:Record<string,string>)=>{
   expect(headers).toBeUndefined();
   if(u.includes('listRecords')) return {data:{records:[record],cursor:'next'}};
   if(restriction === 'unavailable') throw new Error('Unavailable');
   if(restriction === 'deleted') throw Object.assign(new Error('Deleted'),{status:404});
   if(u.includes('getProfile')) return {data:profile};
   return {data:{thread:restriction === 'missing' ? {$type:'app.bsky.feed.defs#notFoundPost'} : restriction === 'blocked' ? {$type:'app.bsky.feed.defs#blockedPost'} : {$type:'app.bsky.feed.defs#threadViewPost',post}}};
  };
  if(restriction === 'unavailable') {
   await expect(blueskyPage(get,'https://bsky.social',did,kind)).rejects.toThrow('Unavailable');
  } else {
   const page = await blueskyPage(get,'https://bsky.social',did,kind);
   expect(page.activities).toHaveLength(restriction === 'none' ? 1 : 0);
   expect(page.ids).toEqual([record.uri]);
   expect(page.cursor).toBe('next');
  }
 }
});
