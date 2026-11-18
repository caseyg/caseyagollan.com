import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from './public-fetch';
import { characterCount } from '../../social-text';
import { checkDeliveryResponse } from './webmention';
import { blueskyImagesEmbed, uploadMastodonMedia, type PreparedPhoto } from './syndication-photos';
import { blueskyAgent, fallbackAgent, notePosted, OAuthUnavailable, type BlueskyAccount, type BlueskyAgent } from './bluesky-oauth';
export interface SyndicationConfig {
 mastodon?: {instance:string;token:string};
 /** OAuth when connected (`oauth`), with the app password as the fallback. */
 bluesky?: BlueskyAccount;
}
export interface SyndicationPost {url:string;text:string;title?:string;published:string;idempotencyKey:string;draft?:string;
 /** A reviewed thread: each entry is one post, sent as a reply to the one before. */
 thread?:string[];
 /** Photos fitted to this network, uploaded with their alt text, each on the post of the thread it names. */
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
/** One sent post of a thread: its public URL, and what a reply to it needs. */
export interface SentPart {url:string;id:string;cid?:string}
/** Resume state for a thread: parts already sent, saved before the next one goes out. */
export interface ThreadProgress {parts:SentPart[];save(parts:SentPart[]):Promise<void>}
/** Longest thread one send accepts. */
export const maxThreadPosts=20;
/** The posts to send: an edited thread, or one post (an edited draft or the generated text). */
export function syndicationThread(post:SyndicationPost,service:'mastodon'|'bluesky'):string[] {
 const limit=service==='bluesky'?300:500, bytes=service==='bluesky'?3000:Infinity;
 if(!post.thread || post.thread.length<2) return [syndicationText(post,limit,bytes,service)];
 if(post.thread.length>maxThreadPosts) throw new DeliveryError('Thread has too many posts',false);
 return post.thread.map(draft=>syndicationText({...post,draft},limit,bytes,service));
}
const blueskyDid=/^did:(plc:[a-z0-9]+|web:[A-Za-z0-9.:%_-]+)$/;
async function blueskyFacets(text:string,base:string,fetcher:PublicFetcher,resolved:Map<string,string>) {
 const encoder=new TextEncoder();
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
 for (const match of text.matchAll(/(?:^|[\s(—])@([a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,})(?![\w@-])/g)) {
  const start = match.index! + match[0].lastIndexOf('@');
  if (linkRanges.some(range => start >= range.start && start < range.end)) continue;
  const handle = match[1];
  if (!resolved.has(handle)) {
   const response = await fetcher(base+'/xrpc/com.atproto.identity.resolveHandle?handle='+encodeURIComponent(handle), {redirect:'manual'});
   checkDeliveryResponse(response);
   const result = await response.json() as {did?:string};
   if (!result.did || !blueskyDid.test(result.did)) throw new DeliveryError('Could not resolve Bluesky mention',false);
   resolved.set(handle,result.did);
  }
  facets.push({index:{byteStart:encoder.encode(text.slice(0,start)).length,byteEnd:encoder.encode(text.slice(0,start+handle.length+1)).length},features:[{$type:'app.bsky.richtext.facet#mention',did:resolved.get(handle)!}]});
 }
 return facets.sort((a,b)=>a.index.byteStart-b.index.byteStart);
}
/** A deterministic record key, so an ambiguous retry updates the same record. */
async function blueskyRecordKey(key:string,published:number):Promise<string> {
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)));
 // A valid TID has 53 timestamp bits and 10 clock bits. Fill the unavailable
 // sub-millisecond precision and clock identifier deterministically from the job.
 const subMillisecond=((hash[0]<<8)|hash[1])%1000;
 const micros=BigInt(published)*1000n+BigInt(subMillisecond);
 if(micros<0n || micros>=(1n<<53n)) throw new DeliveryError('Published timestamp is outside TID range',false);
 let tid=(micros<<10n)|BigInt(((hash[2]<<8)|hash[3])&1023);
 const alphabet='234567abcdefghijklmnopqrstuvwxyz';let rkey='';
 for(let i=0;i<13;i++){rkey=alphabet[Number(tid&31n)]+rkey;tid>>=5n;}
 return rkey;
}
/** Send one post of a Bluesky thread as a `putRecord` on the account's PDS. */
async function sendBlueskyPost(agent:BlueskyAgent,post:SyndicationPost,texts:string[],index:number,parts:SentPart[],published:number,fetcher:PublicFetcher,resolved:Map<string,string>):Promise<SentPart> {
 const base=origin(agent.service);
 const text=texts[index];
 const rkey=await blueskyRecordKey(partKey(post.idempotencyKey,index),published+index);
 const facets=await blueskyFacets(text,base,fetcher,resolved);
 // Replies point at the thread's first post and the post right before them.
 const reply=index?{root:{uri:parts[0].id,cid:parts[0].cid},parent:{uri:parts[index-1].id,cid:parts[index-1].cid}}:undefined;
 const createdAt=index?new Date(published+index).toISOString():post.published;
 const media=mediaFor(post,index,texts.length);
 const embed=media.length ? await blueskyImagesEmbed(base,agent.fetch,media) : undefined;
 const response=await agent.fetch(base+'/xrpc/com.atproto.repo.putRecord',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({repo:agent.did,collection:'app.bsky.feed.post',rkey,validate:true,record:{$type:'app.bsky.feed.post',text,createdAt,facets,...(reply?{reply}:{}),...(embed?{embed}:{})}})});
 checkDeliveryResponse(response);
 let result:Record<string,unknown>;try{result=await response.json() as Record<string,unknown>;}catch{throw new DeliveryError('Invalid provider response',true);}
 if(index<texts.length-1 && typeof result.cid!=='string') throw new DeliveryError('Bluesky did not return a record CID',true);
 return {url:`https://bsky.app/profile/${agent.handle}/post/${rkey}`,id:`at://${agent.did}/app.bsky.feed.post/${rkey}`,...(typeof result.cid==='string'?{cid:result.cid}:{})};
}
/** A thread post's photos: those naming it, with any past the end on the last post. */
const mediaFor=(post:SyndicationPost,index:number,count:number)=>(post.media ?? []).filter(photo=>Math.min(photo.post ?? 0,count-1)===index);
/** The first post keeps the job's key; later posts of a thread add their position. */
const partKey=(key:string,index:number)=>index?`${key}:${index}`:key;

/**
 * Send a post, or a thread as one reply chain. Each later post replies to the one before it.
 * With progress, every sent post is saved before the next goes out, and a retry continues
 * after the last saved one. Returns the first post's URL, which stands for the thread.
 */
export async function syndicate(service:'mastodon'|'bluesky',post:SyndicationPost,config:SyndicationConfig,fetcher:PublicFetcher=safePublicFetch,progress?:ThreadProgress):Promise<string> {
 if(!post.idempotencyKey || !Number.isFinite(Date.parse(post.published))) throw new DeliveryError('Invalid publication metadata',false);
 const texts=syndicationThread(post,service);
 const parts=[...(progress?.parts ?? [])].slice(0,texts.length);
 if(service==='mastodon') {
  const account=config.mastodon;if(!account)throw new DeliveryError('Mastodon is not configured',false);
  const base=origin(account.instance);
  for(let index=parts.length;index<texts.length;index++) {
   const body=new URLSearchParams({status:texts[index],visibility:'public'});
   if(index) body.set('in_reply_to_id',parts[index-1].id);
   // Text is checked before photos upload, so a draft that is too long uploads nothing.
   const media=mediaFor(post,index,texts.length);
   for(const id of media.length ? await uploadMastodonMedia(base,account.token,media,fetcher) : []) body.append('media_ids[]',id);
   const response=await fetcher(base+'/api/v1/statuses',{method:'POST',redirect:'manual',headers:{authorization:`Bearer ${account.token}`,'content-type':'application/x-www-form-urlencoded','Idempotency-Key':partKey(post.idempotencyKey,index)},body});
   checkDeliveryResponse(response);
   let result:{url?:unknown;id?:unknown};try{result=await response.json() as {url?:unknown;id?:unknown};}catch{throw new DeliveryError('Invalid Mastodon response',true);}
   if(typeof result.url!=='string')throw new DeliveryError('Mastodon did not return a canonical URL',true);
   const statusUrl=publicUrl(result.url);
   // Configure the instance WEB_DOMAIN, which serves both API and canonical status URLs.
   if(statusUrl.origin!==base) throw new DeliveryError('Mastodon returned an unexpected status origin',false);
   if(index<texts.length-1 && typeof result.id!=='string') throw new DeliveryError('Mastodon did not return a status id',true);
   parts.push({url:statusUrl.href,id:typeof result.id==='string'?result.id:''});
   if(texts.length>1) await progress?.save(parts);
  }
  return parts[0].url;
 }
 const account=config.bluesky;if(!account)throw new DeliveryError('Bluesky is not configured',false);
 let agent:BlueskyAgent=await blueskyAgent(account,fetcher);
 const resolved=new Map<string,string>();
 const published=Date.parse(post.published);
 for(let index=parts.length;index<texts.length;index++) {
  try { parts.push(await sendBlueskyPost(agent,post,texts,index,parts,published,fetcher,resolved)); }
  catch(error) {
   // OAuth refused mid-send: the record key is deterministic, so the app password rewrites the same post.
   if(!(error instanceof OAuthUnavailable) || agent.auth!=='oauth') throw error;
   agent=await fallbackAgent(account,fetcher,error.message);
   index--;continue;
  }
  if(texts.length>1) await progress?.save(parts);
 }
 await notePosted(account,agent).catch(()=>undefined);
 return parts[0].url;
}
