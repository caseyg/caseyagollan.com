import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from './public-fetch';
import { checkDeliveryResponse } from './webmention';
export interface SyndicationConfig {
 mastodon?: {instance:string;token:string};
 bluesky?: {service:string;identifier:string;password:string};
}
export interface SyndicationPost {url:string;text:string;title?:string;published:string;idempotencyKey:string;draft?:string}
const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
function graphemes(text:string): string[] {return Array.from(segmenter.segment(text),s=>s.segment);}
export function syndicationText(post:SyndicationPost,limit:number,byteLimit=Infinity):string {
 if (post.draft !== undefined) {
  if (!post.draft.trim() || graphemes(post.draft).length > limit || new TextEncoder().encode(post.draft).length > byteLimit) throw new DeliveryError('Draft exceeds provider length limit or is empty',false);
  return post.draft;
 }
 const link=publicUrl(post.url).href;
 if(graphemes(link).length>limit || new TextEncoder().encode(link).length>byteLimit) throw new DeliveryError('Canonical link exceeds provider length limit',false);
 const source=[post.title,post.text].filter(Boolean).join('\n\n').trim();
 const chars=graphemes(source);const originalLength=chars.length;const encoder=new TextEncoder();
 while(chars.length) {
  const suffix=chars.length<originalLength?'…':'';
  const text=chars.join('')+suffix+'\n\n'+link;
  if(graphemes(text).length<=limit && encoder.encode(text).length<=byteLimit) return text;
  chars.pop();
 }
 return link;
}
function origin(value:string):string {
 const url=publicUrl(value);if(url.pathname!=='/' || url.search || url.hash) throw new DeliveryError('Provider must be an HTTPS origin',false);return url.origin;
}
async function request(fetcher:PublicFetcher,url:string,body:unknown,headers:Record<string,string>={}) {
 const response=await fetcher(url,{method:'POST',redirect:'manual',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 checkDeliveryResponse(response);
 try{return await response.json() as Record<string,unknown>;}catch{throw new DeliveryError('Invalid provider response',true);}
}
export async function syndicate(service:'mastodon'|'bluesky',post:SyndicationPost,config:SyndicationConfig,fetcher:PublicFetcher=safePublicFetch):Promise<string> {
 if(!post.idempotencyKey || !Number.isFinite(Date.parse(post.published))) throw new DeliveryError('Invalid publication metadata',false);
 if(service==='mastodon') {
  const account=config.mastodon;if(!account)throw new DeliveryError('Mastodon is not configured',false);
  const base=origin(account.instance);
  const response=await fetcher(base+'/api/v1/statuses',{method:'POST',redirect:'manual',headers:{authorization:`Bearer ${account.token}`,'content-type':'application/x-www-form-urlencoded','Idempotency-Key':post.idempotencyKey},body:new URLSearchParams({status:syndicationText(post,500),visibility:'public'})});
  checkDeliveryResponse(response);
  let result:{url?:unknown};try{result=await response.json() as {url?:unknown};}catch{throw new DeliveryError('Invalid Mastodon response',true);}
  if(typeof result.url!=='string')throw new DeliveryError('Mastodon did not return a canonical URL',true);
  const statusUrl=publicUrl(result.url);
  // Configure the instance WEB_DOMAIN, which serves both API and canonical status URLs.
  if(statusUrl.origin!==base) throw new DeliveryError('Mastodon returned an unexpected status origin',false);
  return statusUrl.href;
 }
 const account=config.bluesky;if(!account)throw new DeliveryError('Bluesky is not configured',false);
 const base=origin(account.service);
 const session=await request(fetcher,base+'/xrpc/com.atproto.server.createSession',{identifier:account.identifier,password:account.password});
 if(typeof session.did!=='string' || !/^did:(plc:[a-z0-9]+|web:[A-Za-z0-9.:%_-]+)$/.test(session.did) || typeof session.accessJwt!=='string') throw new DeliveryError('Invalid Bluesky session',true);
 // Deterministic record key makes an ambiguous retry update the same record.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(post.idempotencyKey));
 const hash=new Uint8Array(digest);
 const milliseconds=BigInt(Date.parse(post.published));
 // A valid TID has 53 timestamp bits and 10 clock bits. Fill the unavailable
 // sub-millisecond precision and clock identifier deterministically from the job.
 const subMillisecond=((hash[0]<<8)|hash[1])%1000;
 const micros=milliseconds*1000n+BigInt(subMillisecond);
 if(micros<0n || micros>=(1n<<53n)) throw new DeliveryError('Published timestamp is outside TID range',false);
 let tid=(micros<<10n)|BigInt(((hash[2]<<8)|hash[3])&1023);
 const alphabet='234567abcdefghijklmnopqrstuvwxyz';let rkey='';
 for(let i=0;i<13;i++){rkey=alphabet[Number(tid&31n)]+rkey;tid>>=5n;}
 const text=syndicationText(post,300,3000);const link=publicUrl(post.url).href;const encoder=new TextEncoder();
 const linkIndex=text.lastIndexOf(link);
 const byteStart=encoder.encode(text.slice(0,linkIndex)).length; const byteEnd=byteStart+encoder.encode(link).length;
 await request(fetcher,base+'/xrpc/com.atproto.repo.putRecord',{repo:session.did,collection:'app.bsky.feed.post',rkey,validate:true,record:{$type:'app.bsky.feed.post',text,createdAt:post.published,facets:linkIndex < 0 ? [] : [{index:{byteStart,byteEnd},features:[{$type:'app.bsky.richtext.facet#link',uri:link}]}]}},{authorization:`Bearer ${session.accessJwt}`});
 return `https://bsky.app/profile/${session.did}/post/${rkey}`;
}
