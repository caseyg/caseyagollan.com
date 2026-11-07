/** Bounded public-Internet HTTP transport. DNS preflight fails closed; the Workers
 * public network resolver remains the final connection authority (not IP pinned).
 * Never bind this transport to a private/VPC network. */
export type PublicFetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class DeliveryError extends Error {
 constructor(message: string, public readonly retryable: boolean) { super(message); this.name = 'DeliveryError'; }
}
const MAX_BYTES = 1024 * 1024;
export function publicUrl(value: string): URL {
 let url: URL; try { url = new URL(value); } catch { throw new DeliveryError('Invalid public URL', false); }
 const host = url.hostname.toLowerCase().replace(/\.$/, '');
 // Reject all literals (including WHATWG-normalized numeric IPv4), local/special-use names.
 if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !host.includes('.') || host.includes(':') || /^\d+(\.\d+){3}$/.test(host) || /(^|\.)(localhost|local|internal|home|lan|test|invalid|onion|arpa)$/.test(host)) throw new DeliveryError('URL must use a public HTTPS hostname', false);
 return url;
}
function publicAddress(address: string): boolean {
 if (address.includes(':')) {
  // Only globally routable unicast; excludes mapped, transition, documentation and local ranges.
  const a = address.toLowerCase();
  return /^[23][0-9a-f]{3}:/.test(a) && !/^(2001:|2002:|3fff:)/.test(a);
 }
 const octets = address.split('.').map(Number);
 if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n<0 || n>255)) return false;
 const [a,b,c] = octets;
 return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0 || (b===88 && c===99))) || (a===198 && (b===18 || b===19 || (b===51 && c===100))) || (a===203 && b===0 && c===113));
}
async function bounded(response: Response, signal?: AbortSignal, maximumBytes=MAX_BYTES): Promise<Response> {
 if (Number(response.headers.get('content-length')) > maximumBytes) { await response.body?.cancel(); throw new DeliveryError('Response exceeds body limit', false); }
 if (!response.body) return response;
 const reader=response.body.getReader(); const chunks: Uint8Array[]=[]; let size=0;
 const abort=()=>{ void reader.cancel(); }; signal?.addEventListener('abort',abort,{once:true});
 try { while(true) { if(signal?.aborted) throw new DeliveryError('Public fetch timed out',true); const {value,done}=await reader.read(); if(signal?.aborted) throw new DeliveryError('Public fetch timed out',true); if(done) break; size+=value.length; if(size>maximumBytes) throw new DeliveryError('Response exceeds body limit',false); chunks.push(value); } }
 catch(error) { await reader.cancel().catch(()=>{}); throw error; }
 finally { signal?.removeEventListener('abort',abort); }
 const bytes=new Uint8Array(size); let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const result=new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
 Object.defineProperty(result,'url',{value:response.url,configurable:true}); return result;
}
export async function safePublicFetch(value: string, init: RequestInit = {}, fetcher: typeof fetch = fetch, maximumBytes=MAX_BYTES): Promise<Response> {
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000);
 const abort=()=>controller.abort(); init.signal?.addEventListener('abort',abort,{once:true}); if(init.signal?.aborted) controller.abort();
 try {
  let url=publicUrl(value); let options={...init,signal:controller.signal,redirect:'manual' as RequestRedirect};
  for(let hop=0;hop<=4;hop++) {
   let addresses=0;
   for(const type of ['A','AAAA']) {
    const dns=await bounded(await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`,{headers:{accept:'application/dns-json'},signal:controller.signal,redirect:'manual'}),controller.signal);
    if(!dns.ok) throw new DeliveryError('Public DNS lookup failed',true);
    const data=await dns.json() as {Status?:number; Answer?:{type:number;data:string}[]};
    if(data.Status!==0) throw new DeliveryError('Public DNS lookup failed',true);
    for(const answer of data.Answer??[]) if(answer.type===1 || answer.type===28) { addresses++; if(!publicAddress(answer.data)) throw new DeliveryError('DNS destination is not public',false); }
   }
   if(!addresses) throw new DeliveryError('Public DNS has no addresses',true);
   const response=await fetcher(url.href,options);
   if(response.status>=300 && response.status<400 && response.headers.has('location')) {
    await response.body?.cancel();
    if(init.redirect==='manual') return response;
    if(hop===4) throw new DeliveryError('Too many redirects',false);
    const next=publicUrl(new URL(response.headers.get('location')!,url).href);
    // Never replay credentials or request bodies across a redirect.
    if(options.method && options.method.toUpperCase()!=='GET' && options.method.toUpperCase()!=='HEAD') throw new DeliveryError('Delivery endpoint redirected',false);
    if(next.origin!==url.origin) {const headers=new Headers(options.headers); headers.delete('authorization');headers.delete('cookie');options={...options,headers};}
    url=next;continue;
   }
   const result=await bounded(response,controller.signal,maximumBytes); Object.defineProperty(result,'url',{value:url.href,configurable:true});return result;
  }
  throw new DeliveryError('Too many redirects',false);
 } catch(error) { if(error instanceof DeliveryError) throw error; throw new DeliveryError('Public fetch failed',true); }
 finally { clearTimeout(timer);init.signal?.removeEventListener('abort',abort); }
}

/** Imported full-resolution photos get a separate bounded allowance. */
export const safePublicImageFetch: PublicFetcher = (url,init)=>safePublicFetch(url,init,fetch,10*1024*1024);
