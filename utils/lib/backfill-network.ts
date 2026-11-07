import { safePublicFetch, type PublicFetcher } from '../../src/lib/server/publishing/public-fetch';

/** One job-local cache and independent request budgets; never used by site reads. */
export function backfillNetwork(fetcher: PublicFetcher = (url,init)=>safePublicFetch(url,init,fetch,new Headers(init?.headers).get('accept')?.startsWith('image/')?10*1024*1024:1024*1024), clock = {now:Date.now,sleep:(ms:number)=>Bun.sleep(ms)}) {
 const budgets = new Map<string,{tail:Promise<void>;next:number}>();
 const cache = new Map<string,Promise<Response>>();
 const stats = {requests:0,rateLimitResponses:0};
 const resetAt = (value:string|null) => !value ? 0 : /^\d+(?:\.\d+)?$/.test(value) ? Number(value)*1000 : Date.parse(value);
 const request: PublicFetcher = async (url,init={}) => {
  const parsed = new URL(url);
  const cloudflare=parsed.hostname==='api.cloudflare.com';
  const api = cloudflare || parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/xrpc/');
  const key = `${parsed.origin}:${api ? 'api' : 'assets'}`;
  const spacing = cloudflare ? 350 : api ? parsed.hostname === 'public.api.bsky.app' ? 200 : 1250 : 150;
  if(!budgets.has(key)) budgets.set(key,{tail:Promise.resolve(),next:0});
  const budget = budgets.get(key)!;
  const perform = async():Promise<Response> => {
   for(let attempt=0;attempt<3;attempt++) {
    const previous = budget.tail;
    let release!:()=>void;
    budget.tail = new Promise<void>(resolve=>{release=resolve;});
    await previous;
    try {
     while(budget.next > clock.now()) await clock.sleep(budget.next-clock.now());
     budget.next = clock.now()+spacing;
    } finally {release();}
    stats.requests++;
    const response = await fetcher(url,{...init,cache:'no-store',headers:{...Object.fromEntries(new Headers(init.headers)),...(init.method==='PUT'?{}:{'Cache-Control':'no-cache'})}});
    const structured=response.headers.get('ratelimit')?.match(/r=(\d+);\s*t=(\d+)/);
    const remaining = structured?.[1] ?? response.headers.get('ratelimit-remaining') ?? response.headers.get('x-ratelimit-remaining');
    const reset = structured ? clock.now()+Number(structured[2])*1000 : resetAt(response.headers.get('ratelimit-reset') ?? response.headers.get('x-ratelimit-reset'));
    if(remaining !== null && Number(remaining)<4 && reset>clock.now()) budget.next=Math.max(budget.next,reset+1000);
    if(response.status!==429) return response;
    stats.rateLimitResponses++;
    const retry = response.headers.get('retry-after');
    const until = retry ? /^\d+(?:\.\d+)?$/.test(retry) ? clock.now()+Number(retry)*1000 : Date.parse(retry) : reset;
    budget.next=Math.max(budget.next,Number.isFinite(until)&&until>clock.now() ? until+1000 : clock.now()+60_000);
    if(attempt===2) return response;
    await response.body?.cancel();
   }
   throw new Error('Backfill retries exhausted');
  };
  // Cloned buffered responses let repeated profiles/avatars share one request.
  const cacheKey=`${init.method ?? 'GET'} ${url}`;
  if(!cache.has(cacheKey)) cache.set(cacheKey,perform());
  return (await cache.get(cacheKey)!).clone();
 };
 return {fetcher:request,stats};
}
