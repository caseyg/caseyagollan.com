import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from './public-fetch';
import { characterCount } from '../../social-text';
import { checkDeliveryResponse } from './webmention';
import { blueskyImagesEmbed, uploadMastodonMedia, type PreparedPhoto } from './syndication-photos';
export interface SyndicationConfig {
 mastodon?: {instance:string;token:string};
 bluesky?: {service:string;identifier:string;password:string};
}
export interface SyndicationPost {url:string;text:string;title?:string;published:string;idempotencyKey:string;draft?:string;
 /** Photos fitted to this network, uploaded with their alt text. */
 media?:PreparedPhoto[]}
/**
 * One key per social post. Bluesky links name the same post by DID or by handle
 * (bsky.app/profile/did:plc:…/post/X and bsky.app/profile/caseyagollan.com/post/X),
 * so they compare by record key; other links compare by URL.
 */
export function syndicationKey(url:string):string {
 try {
  const link=new URL(url);
  const bluesky=link.origin==='https://bsky.app' && link.pathname.match(/^\/profile\/[^/]+\/post\/([^/]+)\/?$/);
  return bluesky ? `bsky:${bluesky[1]}` : link.href.replace(/\/$/,'');
 } catch { return url; }
}
const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
function graphemes(text:string): string[] {return Array.from(segmenter.segment(text),s=>s.segment);}
export function syndicationText(post:SyndicationPost,limit:number,byteLimit=Infinity,service:'bluesky'|'mastodon'='bluesky'):string {
 if (post.draft !== undefined) {
  if (!post.draft.trim() || characterCount(post.draft,service) > limit || new TextEncoder().encode(post.draft).length > byteLimit) throw new DeliveryError('Draft exceeds provider length limit or is empty',false);
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
  const status=new URLSearchParams({status:syndicationText(post,500,Infinity,'mastodon'),visibility:'public'});
  // Text is checked before photos upload, so a draft that is too long uploads nothing.
  for(const id of post.media?.length ? await uploadMastodonMedia(base,account.token,post.media,fetcher) : []) status.append('media_ids[]',id);
  const response=await fetcher(base+'/api/v1/statuses',{method:'POST',redirect:'manual',headers:{authorization:`Bearer ${account.token}`,'content-type':'application/x-www-form-urlencoded','Idempotency-Key':post.idempotencyKey},body:status});
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
 const text=syndicationText(post,300,3000);const encoder=new TextEncoder();
 const facets: {index:{byteStart:number;byteEnd:number};features:Record<string,string>[]}[] = [];
 const linkRanges: {start:number;end:number}[] = [];
 for (const match of text.matchAll(/https?:\/\/[^\s<>"\u201c\u201d]+/gi)) {
  let value = match[0].replace(/[.,;:!?]+$/, '');
  // Keep balanced parentheses in URLs, but exclude surrounding prose punctuation.
  while (/[)\]}]$/.test(value)) {
   const close = value.at(-1)!;
   const open = {')':'(',']':'[','}':'{'}[close as ')' | ']' | '}'];
   if (value.split(close).length <= value.split(open).length) break;
   value = value.slice(0,-1).replace(/[.,;:!?]+$/, '');
  }
  let uri: string;
  try { const url = new URL(value); if (!url.hostname || url.username || url.password) continue; uri = url.href; } catch { continue; }
  const start = match.index!, end = start + value.length;
  linkRanges.push({start,end});
  facets.push({index:{byteStart:encoder.encode(text.slice(0,start)).length,byteEnd:encoder.encode(text.slice(0,end)).length},features:[{$type:'app.bsky.richtext.facet#link',uri}]});
 }
 const resolved = new Map<string,string>();
 for (const match of text.matchAll(/(?:^|[\s(—])@([a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,})(?![\w@-])/g)) {
  const start = match.index! + match[0].lastIndexOf('@');
  if (linkRanges.some(range => start >= range.start && start < range.end)) continue;
  const handle = match[1];
  if (!resolved.has(handle)) {
   const response = await fetcher(base+'/xrpc/com.atproto.identity.resolveHandle?handle='+encodeURIComponent(handle), {redirect:'manual'});
   checkDeliveryResponse(response);
   const result = await response.json() as {did?:string};
   if (!result.did || !/^did:(plc:[a-z0-9]+|web:[A-Za-z0-9.:%_-]+)$/.test(result.did)) throw new DeliveryError('Could not resolve Bluesky mention',false);
   resolved.set(handle,result.did);
  }
  facets.push({index:{byteStart:encoder.encode(text.slice(0,start)).length,byteEnd:encoder.encode(text.slice(0,start+handle.length+1)).length},features:[{$type:'app.bsky.richtext.facet#mention',did:resolved.get(handle)!}]});
 }
 facets.sort((a,b)=>a.index.byteStart-b.index.byteStart);
 const embed=post.media?.length ? await blueskyImagesEmbed(base,session.accessJwt,post.media,fetcher) : undefined;
 await request(fetcher,base+'/xrpc/com.atproto.repo.putRecord',{repo:session.did,collection:'app.bsky.feed.post',rkey,validate:true,record:{$type:'app.bsky.feed.post',text,createdAt:post.published,facets,...(embed?{embed}:{})}},{authorization:`Bearer ${session.accessJwt}`});
 // Bridgy and readers expect handle URLs; the DID form is the fallback when the handle is unverified.
 const handle=typeof session.handle==='string' && session.handle!=='handle.invalid' && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(session.handle) ? session.handle : session.did;
 return `https://bsky.app/profile/${handle}/post/${rkey}`;
}
