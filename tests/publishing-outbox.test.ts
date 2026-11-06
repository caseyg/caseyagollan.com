import { expect, test } from 'bun:test';
import { enqueueDelivery, processOutbox, type DeliveryEvent, type OutboxJob } from '../src/lib/server/publishing/outbox';
const event: DeliveryEvent = { source:'https://example.com/2026/11/06/note', revision:'abc', action:'publish', targets:['https://other.test/post'], syndicateTo:['mastodon'], text:'hello', published:'2026-11-06T12:00:00Z' };
function setup() {
 const files = new Map<string,{etag:string;data:string}>(); let version=0;
 const fake = {
  async delete(key:string) {files.delete(key);},
  async get(key:string) { const value=files.get(key); return value ? {etag:value.etag, json:async()=>JSON.parse(value.data), text:async()=>value.data} : null; },
  async put(key:string,data:string,options?:{onlyIf?:{etagMatches?:string;etagDoesNotMatch?:string}}) {
   const current=files.get(key); const condition=options?.onlyIf;
   if (condition?.etagMatches && current?.etag!==condition.etagMatches) return null;
   if (condition?.etagDoesNotMatch==='*' && current) return null;
   const value={etag:String(++version),data}; files.set(key,value); return {etag:value.etag};
  },
  async list(options:{prefix:string;limit:number;cursor?:string}) {
   const keys=[...files.keys()].filter(key=>key.startsWith(options.prefix)).sort().filter(key=>!options.cursor || key>options.cursor);
   const page=keys.slice(0,options.limit);return {objects:page.map(key=>({key})),truncated:keys.length>page.length,cursor:page.at(-1)};
  }
 };
 const bucket=fake as unknown as R2Bucket;
 return {bucket,files,read:(id:string)=>JSON.parse(files.get('private/outbox/'+id+'.json')!.data) as OutboxJob};
}
test('immutable enqueue is stable across object key ordering and preserves completion', async()=>{
 const app=setup(); const id=await enqueueDelivery(app.bucket,event,1000);
 expect(await enqueueDelivery(app.bucket,Object.fromEntries(Object.entries(event).reverse()) as DeliveryEvent,2000)).toBe(id);
 expect(app.read(id).createdAt).toBe(1000);
 await processOutbox(app.bucket,async()=> 'done',{now:()=>3000});
 await enqueueDelivery(app.bucket,event,4000);
 expect(app.read(id).status).toBe('done');
 expect((await processOutbox(app.bucket,async()=>{throw Error('duplicate');},{now:()=>5000})).processed).toBe(0);
});
test('two concurrent workers can only claim one job',async()=>{
 const app=setup();await enqueueDelivery(app.bucket,event,0);let calls=0;
 const run=()=>processOutbox(app.bucket,async()=>{calls++;await Promise.resolve();return 'done';},{now:()=>10});
 await Promise.all([run(),run()]);expect(calls).toBe(1);
});
test('checkpoint persists progress through retry with exponential backoff and no enqueue reset',async()=>{
 const app=setup();const id=await enqueueDelivery(app.bucket,event,0);
 await processOutbox(app.bucket,async(job,checkpoint)=>{await checkpoint({...job.progress,webmentions:['https://other.test/post']});throw Error('secret token');},{now:()=>100});
 const first=app.read(id);expect(first.status).toBe('pending');expect(first.attempts).toBe(1);expect(first.nextAttemptAt).toBeGreaterThan(100);
 expect(first.progress.webmentions).toEqual(event.targets);expect(first.error).not.toContain('secret');
 await enqueueDelivery(app.bucket,event,0);expect(app.read(id)).toEqual(first);
 expect((await processOutbox(app.bucket,async()=> 'done',{now:()=>first.nextAttemptAt-1})).processed).toBe(0);
 await processOutbox(app.bucket,async(job)=>{expect(job.progress.webmentions).toEqual(event.targets);throw Error('again');},{now:()=>first.nextAttemptAt});
 const second=app.read(id);expect(second.nextAttemptAt-first.nextAttemptAt).toBeGreaterThan(first.nextAttemptAt-100);
});
test('expired lease recovers crashed worker but stale checkpoint cannot overwrite new owner',async()=>{
 const app=setup();const id=await enqueueDelivery(app.bucket,event,0);let now=100;let resolve!:()=>void;
 const gate=new Promise<void>(r=>resolve=r);let entered!:()=>void;const started=new Promise<void>(r=>entered=r);
 const old=processOutbox(app.bucket,async(job,checkpoint)=>{entered();await gate;await checkpoint(job.progress);return 'done';},{now:()=>now,leaseMs:100});
 await started;expect(app.read(id).status).toBe('running');now=201;
 await processOutbox(app.bucket,async()=> 'superseded',{now:()=>now,leaseMs:100});resolve();await old;
 expect(app.read(id).status).toBe('superseded');expect(app.read(id).attempts).toBe(2);
});
test('terminal failures and attempt limit remain inspectable without exception secrets',async()=>{
 for (const permanent of [true,false]) {const app=setup();const id=await enqueueDelivery(app.bucket,event,0);
 const result=await processOutbox(app.bucket,async()=>{throw Object.assign(Error('private upstream response'),{retryable:!permanent});},{now:()=>1,maxAttempts:1});
 expect(result.failed).toBe(1);expect(app.read(id).status).toBe('failed');expect(app.read(id).error).not.toContain('private');}
});

test('bounded scans wrap past retained completion markers', async()=>{
 const app=setup();for(let n=0;n<6;n++)await enqueueDelivery(app.bucket,{...event,revision:String(n)},0);
 let calls=0;const run=()=>processOutbox(app.bucket,async()=>{calls++;return 'done';},{now:()=>1,limit:2});
 await run();expect(calls).toBe(2);await run();expect(calls).toBe(4);await run();expect(calls).toBe(6);
 await run();expect(calls).toBe(6);
 const id=await enqueueDelivery(app.bucket,{...event,revision:'new'},1);
 for(let n=0;n<5;n++)await run();
 expect(app.read(id).status).toBe('done');expect(calls).toBe(7);
});
test('crash after a checkpoint keeps confirmed side effects on lease recovery',async()=>{
 const app=setup();const id=await enqueueDelivery(app.bucket,event,0);let now=1;
 await processOutbox(app.bucket,async(job,checkpoint)=>{await checkpoint({...job.progress,syndication:{mastodon:'https://social.test/status/1'}});now=102;throw Error('crashed');},{now:()=>now,leaseMs:100});
 expect(app.read(id).status).toBe('running');
 await processOutbox(app.bucket,async(job)=>{expect(job.progress.syndication.mastodon).toBe('https://social.test/status/1');return 'done';},{now:()=>now,leaseMs:100});
 expect(app.read(id).status).toBe('done');expect(app.read(id).attempts).toBe(2);
});

test('terminal history never consumes active delivery slots',async()=>{
 const app=setup();const first=await enqueueDelivery(app.bucket,event,0);
 const completed={...app.read(first),status:'done',attempts:1};
 app.files.clear();
 for(let n=0;n<1000;n++)app.files.set('private/outbox/'+String(n).padStart(64,'0')+'.json',{etag:'old'+n,data:JSON.stringify({...completed,id:String(n)})});
 const id=await enqueueDelivery(app.bucket,{...event,revision:'fresh'},1);
 let calls=0;const result=await processOutbox(app.bucket,async()=>{calls++;return 'done';},{now:()=>2,limit:3});
 expect(calls).toBe(1);expect(result.processed).toBe(1);expect(app.read(id).status).toBe('done');
 expect(app.files.has('private/outbox-ready/'+id)).toBe(false);
 await enqueueDelivery(app.bucket,{...event,revision:'fresh'},3);
 expect(app.files.has('private/outbox-ready/'+id)).toBe(false);
});
test('rotating repair recreates missing ready entries without resetting canonical progress',async()=>{
 const app=setup();const id=await enqueueDelivery(app.bucket,event,0);
 expect(app.files.has('private/outbox-ready/'+id)).toBe(true);
 app.files.delete('private/outbox-ready/'+id);
 const record=app.read(id);record.progress.webmentionFailures={'https://other.test/post':'rejected'};
 app.files.set('private/outbox/'+id+'.json',{etag:'checkpoint',data:JSON.stringify(record)});
 let calls=0;await processOutbox(app.bucket,async(job)=>{calls++;expect(job.progress.webmentionFailures).toEqual(record.progress.webmentionFailures);return 'done';},{now:()=>1});
 expect(calls).toBe(1);expect(app.read(id).status).toBe('done');
});

test('active scan passes delayed retries without consuming the claim limit',async()=>{
 const app=setup();
 for(let n=0;n<10;n++) {const id=await enqueueDelivery(app.bucket,{...event,revision:'delayed'+n},0);const record=app.read(id);record.nextAttemptAt=1000;app.files.set('private/outbox/'+id+'.json',{etag:'delayed'+n,data:JSON.stringify(record)});}
 const id=await enqueueDelivery(app.bucket,{...event,revision:'due'},0);
 let calls=0;await processOutbox(app.bucket,async()=>{calls++;return 'done';},{now:()=>1,limit:1});
 expect(calls).toBe(1);expect(app.read(id).status).toBe('done');
});
