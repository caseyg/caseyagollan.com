import {test,expect} from 'bun:test';
import {backfillNetwork} from '../utils/lib/backfill-network';

test('job-local lookups share requests and preserve independently readable bodies',async()=>{
 let calls=0;let now=0;
 const network=backfillNetwork(async()=>{calls++;return Response.json({ok:true});},{now:()=>now,sleep:async(ms)=>{now+=ms;}});
 const [a,b]=await Promise.all([network.fetcher('https://example.org/api/v1/statuses/1'),network.fetcher('https://example.org/api/v1/statuses/1')]);
 expect(await a.json()).toEqual({ok:true});expect(await b.json()).toEqual({ok:true});expect(calls).toBe(1);
});
test('API budgets are per host and separate from asset traffic',async()=>{
 let now=0;const calls:{url:string;at:number}[]=[];
 const network=backfillNetwork(async(url)=>{calls.push({url,at:now});return Response.json({});},{now:()=>now,sleep:async(ms)=>{now+=ms;}});
 await network.fetcher('https://one.example/api/v1/statuses/1');
 await network.fetcher('https://two.example/api/v1/statuses/1');
 await network.fetcher('https://one.example/avatar.png');
 await network.fetcher('https://one.example/api/v1/statuses/2');
 expect(calls.map(c=>c.at)).toEqual([0,0,0,1250]);
});
test('near-empty API budgets wait until the advertised reset',async()=>{
 let now=0;const times:number[]=[];
 const network=backfillNetwork(async()=>{times.push(now);return Response.json({},{headers:{'x-ratelimit-remaining':'1','x-ratelimit-reset':'5'}});},{now:()=>now,sleep:async(ms)=>{now+=ms;}});
 await network.fetcher('https://one.example/api/v1/statuses/1');
 await network.fetcher('https://one.example/api/v1/statuses/2');
 expect(times).toEqual([0,6000]);
});
test('unexpected throttling honors Retry-After before retrying',async()=>{
 let now=0;const times:number[]=[];
 const network=backfillNetwork(async()=>{times.push(now);return times.length===1?new Response(null,{status:429,headers:{'retry-after':'2'}}):Response.json({ok:true});},{now:()=>now,sleep:async(ms)=>{now+=ms;}});
 expect((await network.fetcher('https://one.example/api/v1/statuses/1')).ok).toBe(true);
 expect(times).toEqual([0,3000]);expect(network.stats.rateLimitResponses).toBe(1);
});

test('Cloudflare structured quota headers reserve the advertised cooldown',async()=>{
 let now=0;const times:number[]=[];
 const network=backfillNetwork(async()=>{times.push(now);return Response.json({},{headers:{ratelimit:'"default";r=2;t=5'}});},{now:()=>now,sleep:async(ms)=>{now+=ms;}});
 await network.fetcher('https://api.cloudflare.com/client/v4/accounts/a/r2/buckets/b/objects/one');
 await network.fetcher('https://api.cloudflare.com/client/v4/accounts/a/r2/buckets/b/objects/two');
 expect(times).toEqual([0,6000]);
});
