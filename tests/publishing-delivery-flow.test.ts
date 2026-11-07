import { expect, test } from 'bun:test';
import { deliverPublication, processPublishing, queuePublication, reconcilePublications, syndicationTargets } from '../src/lib/server/publishing/delivery';
import { enqueueDelivery, type DeliveryEvent, type OutboxJob } from '../src/lib/server/publishing/outbox';
import { DeliveryError } from '../src/lib/server/publishing/public-fetch';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';
import { publicationForPost } from '../src/lib/server/publishing/publication';
import { parsePost } from '../src/lib/server/parse-post';
const config: PublishingConfig = { me:'https://example.com/',introspectionEndpoint:'https://auth.example/introspect',owner:'caseyg',repo:'content',branch:'test',token:'git',timeZone:'America/New_York' };
const markdown = '---\ndate: 2026-11-06T12:00:00-05:00\n---\nHello';
function setup() {
 const files = new Map<string,{etag:string;data:string}>(); let revision=0;
 const bucket={
  async get(key:string) { const file=files.get(key); return file? {etag:file.etag,text:async()=>file.data,json:async()=>JSON.parse(file.data)}:null; },
  async put(key:string,data:string,options?:any) { const current=files.get(key); const cond=options?.onlyIf; if(cond?.etagMatches && current?.etag!==cond.etagMatches || cond?.etagDoesNotMatch==='*' && current)return null; const result={etag:String(++revision),data};files.set(key,result);return result; },
  async list(options:any) {const keys=[...files.keys()].filter(k=>k.startsWith(options.prefix)).sort();return {objects:keys.slice(0,options.limit).map(key=>({key})),truncated:false};}
 } as unknown as R2Bucket;
 return {bucket,files};
}
const event:DeliveryEvent={source:'https://example.com/2026/11/06/note/',revision:'a'.repeat(64),action:'publish',targets:['https://target.example.org/post'],syndicateTo:[],text:'Hello',published:'2026-11-06T12:00:00-05:00'};
function job(payload=event):OutboxJob {return {id:'job',event:structuredClone(payload),status:'running',attempts:1,createdAt:0,nextAttemptAt:0,leaseUntil:300000,progress:{webmentions:[],syndication:{},syndicationStartedAt:{}}};}
const sourceResponse=(revision=event.revision)=>new Response(`<html><head><meta name="publishing-revision" content="${revision}"></head></html>`);
test('delivery waits for the intended public revision and checkpoints accepted Webmentions',async()=>{
 const {bucket}=setup();let sends=0;
 const task=job();
 const fetcher=async(url:string)=>{if(url===event.source)return sourceResponse();if(url===event.targets[0])return new Response('<link rel="webmention" href="/mention">');sends++;return new Response(null,{status:202});};
 await expect(deliverPublication(config,bucket,job(),async()=>{}, {publicFetch:async()=>sourceResponse('b'.repeat(64))})).rejects.toMatchObject({retryable:true});
 expect(sends).toBe(0);
 expect(await deliverPublication(config,bucket,task,async()=>{}, {publicFetch:fetcher})).toBe('done');expect(task.progress.webmentions).toEqual(event.targets);expect(sends).toBe(1);
 expect(await deliverPublication(config,bucket,task,async()=>{}, {publicFetch:fetcher})).toBe('done');expect(sends).toBe(1);
});
test('a newer Git source supersedes queued work even while the old page is static',async()=>{
 const {bucket}=setup();let publicCalls=0;
 const payload={...event,sourcePath:'notes/2026-11-06-note.md'};
 const gitFetch=(async()=>Response.json({type:'file',path:payload.sourcePath,sha:'git-sha',encoding:'base64',content:btoa(markdown)})) as unknown as typeof fetch;
 expect(await deliverPublication(config,bucket,job(payload),async()=>{}, {gitFetch,publicFetch:async()=>{publicCalls++;return sourceResponse();}})).toBe('superseded');expect(publicCalls).toBe(0);
});
test('an old queued POSSE destination cannot syndicate an imported record back out',async()=>{
 const {bucket}=setup();
 const raw='---\ndate: 2026-11-06T12:00:00-05:00\npesos-source: [mastodon:post:123]\n---\nImported';
 const publication=await publicationForPost(parsePost(raw,'notes','2026-11-06-import.md'),config.me);
 const task=job({...event,source:publication.url,sourcePath:publication.sourcePath,revision:publication.revision,targets:[],syndicateTo:['mastodon']});
 const gitFetch=(async()=>Response.json({type:'file',path:publication.sourcePath,sha:'git-sha',encoding:'base64',content:btoa(raw)})) as unknown as typeof fetch;
 let publicCalls=0;
 const result=await deliverPublication(config,bucket,task,async()=>{}, {gitFetch,publicFetch:async(url)=>{
  expect(url).toBe(publication.url); publicCalls++;
  return sourceResponse(publication.revision);
 }});
 expect(result).toBe('done');expect(publicCalls).toBe(1);
 expect(task.progress.syndication).toEqual({});
});
test('removal Webmentions wait for a public 404/410',async()=>{
 const {bucket}=setup();const task=job({...event,action:'remove'});
 await expect(deliverPublication(config,bucket,task,async()=>{}, {publicFetch:async()=>new Response('Old static page')})).rejects.toMatchObject({retryable:true});
 let sends=0;await deliverPublication(config,bucket,task,async()=>{}, {publicFetch:async(url)=>url===event.source?new Response(null,{status:410}):url===event.targets[0]?new Response('',{headers:{Link:'<https://target.example.org/mention>; rel="webmention"'}}):(sends++,new Response(null,{status:202}))});expect(sends).toBe(1);
});
test('initial manifest avoids historical sends and later direct Git changes/removals enqueue work',async()=>{
 const {bucket,files}=setup();const publication=await publicationForPost(parsePost(markdown,'notes','2026-11-06-note.md'),'https://example.com');publication.targets=event.targets;
 await reconcilePublications(bucket,[publication],0);expect([...files.keys()].filter(k=>k.startsWith('private/outbox/'))).toHaveLength(0);
 await reconcilePublications(bucket,[{...publication,revision:'b'.repeat(64)}],1);expect([...files.keys()].filter(k=>k.startsWith('private/outbox/'))).toHaveLength(1);
 await reconcilePublications(bucket,[],2);expect([...files.keys()].filter(k=>k.startsWith('private/outbox/'))).toHaveLength(2);
});
test('draft Git writes never enqueue public delivery and disabled processing does no network work',async()=>{
 const {bucket,files}=setup();const draft='---\ndate: 2026-11-06T12:00:00-05:00\npost-status: draft\nsyndicationTargets: [mastodon]\n---\nhttps://target.example.org/post';
 expect(await queuePublication({...config,state:bucket},'notes/2026-11-06-draft.md',draft)).toBe(true);expect(files.size).toBe(0);
 expect(await processPublishing({...config,state:bucket,deliveryEnabled:false},{publicFetch:async()=>{throw new Error('must not fetch');}})).toEqual({processed:0,failed:0});
});
test('syndication receipts deduplicate across revisions and retain the canonical URL',async()=>{
 const {bucket}=setup();let posts=0;let revision=event.revision;
 const configured={...config,syndication:{mastodon:{instance:'https://social.example.org',token:'secret'}}};
 const fetcher=async(url:string)=>{if(url===event.source)return sourceResponse(revision);posts++;return Response.json({url:'https://social.example.org/@casey/123'});};
 const first=job({...event,targets:[],syndicateTo:['mastodon']});await deliverPublication(configured,bucket,first,async()=>{}, {publicFetch:fetcher,now:()=>1});expect(posts).toBe(1);
 revision='b'.repeat(64);const second=job({...event,revision,targets:[],syndicateTo:['mastodon']});await deliverPublication(configured,bucket,second,async()=>{}, {publicFetch:fetcher,now:()=>1000});expect(posts).toBe(1);expect(second.progress.syndication.mastodon).toContain('/123');
 expect(syndicationTargets({...configured,state:bucket})).toEqual([{uid:'https://example.com/syndication/mastodon',name:'Mastodon'}]);
});
test('ambiguous Mastodon sends are never blindly retried beyond its deduplication window',async()=>{
 const {bucket}=setup();let posts=0;let now=1;
 const configured={...config,syndication:{mastodon:{instance:'https://social.example.org',token:'secret'}}};
 const fetcher=async(url:string)=>{if(url===event.source)return sourceResponse();posts++;throw new DeliveryError('Ambiguous send',true);};
 const task=job({...event,targets:[],syndicateTo:['mastodon']});await expect(deliverPublication(configured,bucket,task,async()=>{}, {publicFetch:fetcher,now:()=>now})).rejects.toMatchObject({retryable:true});
 now+=46*60_000;await expect(deliverPublication(configured,bucket,job(task.event),async()=>{}, {publicFetch:fetcher,now:()=>now})).rejects.toMatchObject({retryable:false});expect(posts).toBe(1);
});

test('a permanent Webmention rejection is recorded separately from successful sends',async()=>{
 const {bucket}=setup();const task=job();
 await deliverPublication(config,bucket,task,async()=>{}, {publicFetch:async(url)=>url===event.source?sourceResponse():new Response('No discovery endpoint')});
 expect(task.progress.webmentions).toEqual([]);
 expect(task.progress.webmentionFailures?.[event.targets[0]]).toBe('rejected_or_unsupported');
});


test('manifest recovery reuses the durable Micropub transition instead of sending twice',async()=>{
 const {bucket,files}=setup();
 await reconcilePublications(bucket,[],0);
 const body='---\ndate: 2026-11-06T12:00:00-05:00\n---\nhttps://target.example.org/post';
 await queuePublication({...config,state:bucket},'notes/2026-11-06-note.md',body,undefined,'git-commit-1');
 const publication=await publicationForPost(parsePost(body,'notes','2026-11-06-note.md'),'https://example.com');
 await reconcilePublications(bucket,[publication],1);
 const canonical=[...files.entries()].filter(([key])=>key.startsWith('private/outbox/'));
 expect(canonical).toHaveLength(1);expect(JSON.parse(canonical[0][1].data).event.generation).toBe('git-commit-1');
});
