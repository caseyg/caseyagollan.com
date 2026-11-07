import { parseDocument } from 'yaml';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { Root, Element } from 'hast';
import { sanitizePublishingHtml } from '../../utils/sanitizeHtml';
import { socialSnapshots, type SocialSnapshot } from '../../social-snapshots';
import type { SocialImageStore } from './social-media';
import { safePublicFetch, publicUrl, type PublicFetcher } from './public-fetch';

const key = '_micropubSocialSnapshots';
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_SAVED_IMAGE_BYTES = 5 * 1024 * 1024;
const escape = (v: string) => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** AT Protocol facet offsets count UTF-8 bytes, not JavaScript characters. */
function blueskyHtml(text: string, facets: unknown): string {
 const bytes = new TextEncoder().encode(text);
 const decoder = new TextDecoder('utf-8', {fatal:true});
 let end = 0, html = '';
 if(Array.isArray(facets)) for(const facet of [...facets].sort((a,b)=>(a?.index?.byteStart ?? 0)-(b?.index?.byteStart ?? 0))) {
  const start = facet?.index?.byteStart, stop = facet?.index?.byteEnd;
  if(!Number.isInteger(start) || !Number.isInteger(stop) || start < end || stop <= start || stop > bytes.length) continue;
  const feature = facet.features?.find((f:any)=>['app.bsky.richtext.facet#link','app.bsky.richtext.facet#mention','app.bsky.richtext.facet#tag'].includes(f?.$type));
  let href: string;
  try {
   if(feature?.$type === 'app.bsky.richtext.facet#link') href = publicUrl(feature.uri).href;
   else if(feature?.$type === 'app.bsky.richtext.facet#mention' && typeof feature.did === 'string') href = `https://bsky.app/profile/${encodeURI(feature.did)}`;
   else if(feature?.$type === 'app.bsky.richtext.facet#tag' && typeof feature.tag === 'string') href = `https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`;
   else continue;
   const gap = decoder.decode(bytes.slice(end,start));
   const label = decoder.decode(bytes.slice(start,stop));
   html += escape(gap) + `<a href="${escape(href)}">${escape(label)}</a>`;
   end = stop;
  } catch { /* Ignore malformed facets, preserving the source text. */ }
 }
 return `<p>${(html+escape(decoder.decode(bytes.slice(end)))).replace(/\n/g,'<br>')}</p>`;
}
function cleanHtml(html: string): string {
 const tree = fromHtml(sanitizePublishingHtml(html), { fragment: true });
 function strip(node: Root | Element) {
  node.children = node.children.filter(n => n.type !== 'element' || !['img','iframe','video','audio','source'].includes(n.tagName));
  for (const child of node.children) if(child.type === 'element') strip(child);
 }
 strip(tree); return toHtml(tree);
}
function raster(bytes: Uint8Array, type: string): boolean {
 const starts = (...magic: number[]) => magic.every((v,i)=>bytes[i] === v);
 const ascii = (a:number,b:number) => String.fromCharCode(...bytes.slice(a,b));
 return (type === 'image/png' && starts(137,80,78,71,13,10,26,10)) ||
  (type === 'image/jpeg' && starts(255,216,255)) ||
  (type === 'image/gif' && ['GIF87a','GIF89a'].includes(ascii(0,6))) ||
  (type === 'image/webp' && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP');
}
/** Fetching is bounded by safePublicFetch and a single deadline shared by metadata and images. */
async function snapshot(url: string, fetcher: PublicFetcher, signal: AbortSignal, budget: {bytes: number}, storeImage?: SocialImageStore, previous?: SocialSnapshot, mastodonSource?: {instance:string;id:string}): Promise<SocialSnapshot | undefined> {
 const target = publicUrl(mastodonSource?.instance ?? url);
 const get = (u: string) => { publicUrl(u); return fetcher(u, {headers:{accept:'application/json'},signal}); };
 let result: Omit<SocialSnapshot,'images'>;
 let media: {url:string;alt:string}[] = [];
 let avatar: string | undefined;
 let previewImage: string | undefined;
 const preview = (value: any, blue = false) => {
  if (!value || typeof (blue ? value.uri : value.url) !== 'string') return;
  try {
   result.preview = {url:publicUrl(blue ? value.uri : value.url).href, title:typeof value.title === 'string' ? value.title.slice(0,2000) : '', description:typeof value.description === 'string' ? value.description.slice(0,5000) : '', ...(!blue && typeof value.provider_name === 'string' ? {site:value.provider_name.slice(0,500)} : {})};
   const image = blue ? value.thumb : value.image;
   if(typeof image === 'string' && image) previewImage = publicUrl(image).href;
  } catch { /* Invalid preview URLs or images are omitted. */ }
 };
 const blue = target.hostname === 'bsky.app' && target.pathname.match(/^\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)\/?$/);
 const mastodon = mastodonSource ? [undefined,mastodonSource.id] : target.pathname.match(/^\/@[^/]+\/(\d+)\/?$/) ?? target.pathname.match(/^\/users\/[^/]+\/statuses\/(\d+)\/?$/);
 if (blue) {
  const actor = decodeURIComponent(blue[1]);
  const uri = `at://${actor}/app.bsky.feed.post/${blue[2]}`;
  const response = await get(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`);
  if(!response.ok) return;
  const data = await response.json() as any;
  const post = data?.thread?.post;
  if(typeof post?.record?.text !== 'string' || typeof post?.author?.handle !== 'string' || !post.author.handle) return;
  const handle = post.author.handle;
  avatar = typeof post.author.avatar === 'string' ? post.author.avatar : undefined;
  result = {version:1,url,platform:'bluesky',author:{name:post.author.displayName || handle,handle:`@${handle}`,url:`https://bsky.app/profile/${encodeURIComponent(handle)}`},published:post.record.createdAt,fetchedAt:new Date().toISOString(),html:blueskyHtml(post.record.text,post.record.facets)};
  const embed = post.embed?.$type === 'app.bsky.embed.recordWithMedia#view' ? post.embed.media : post.embed;
  media = (embed?.images ?? []).slice(0,4).filter((i:any)=>typeof i.fullsize === 'string').map((i:any)=>({url:i.fullsize,alt:typeof i.alt === 'string' ? i.alt : ''}));
  preview(embed?.external, true);
 } else if(mastodon) {
  const response = await get(`${target.origin}/api/v1/statuses/${mastodon[1]}`);
  if(!response.ok) return;
  const status = await response.json() as any;
  const post = status.reblog ?? status;
  if(mastodonSource && post.url !== url) return;
  // Unlisted posts deliberately excluded from this public archive.
  if(post.visibility !== 'public' || typeof post.content !== 'string' || typeof post.account?.acct !== 'string') return;
  const account = post.account;
  avatar = typeof account.avatar_static === 'string' ? account.avatar_static : account.avatar;
  const handle = account.acct.includes('@') ? `@${account.acct}` : `@${account.acct}@${target.hostname}`;
  result = {version:1,url,platform:'mastodon',author:{name:account.display_name || account.acct,handle,url:publicUrl(account.url).href},published:post.created_at,fetchedAt:new Date().toISOString(),html:cleanHtml(post.content),...(post.spoiler_text ? {warning:post.spoiler_text} : {})};
  media = (post.media_attachments ?? []).slice(0,4).filter((i:any)=>i.type === 'image' && typeof i.url === 'string').map((i:any)=>({url:i.preview_url || i.url,alt:typeof i.description === 'string' ? i.description : ''}));
  preview(post.card);
  if(post.sensitive && !result.warning) result.warning = 'Sensitive content';
 } else return;
 const saved: SocialSnapshot = {...result,images:[]};
 if(!socialSnapshots([saved]).length) return;
 if(!storeImage) return previous ?? saved;
 let mediaComplete = true;
 const assets = [...(avatar ? [{url:avatar,alt:'',kind:'avatar'}] : []),...(previewImage ? [{url:previewImage,alt:'',kind:'preview'}] : []),...media.map(image=>({...image,kind:'attachment'}))];
 for(const image of assets) {
  try {
   if(signal.aborted) {mediaComplete=false; break;}
   publicUrl(image.url);
   const response = await fetcher(image.url,{headers:{accept:'image/png,image/jpeg,image/webp,image/gif'},signal});
   if(!response.ok) {mediaComplete=false;continue;}
   const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
   if(Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {await response.body?.cancel(); mediaComplete=false; continue;}
   const bytes = new Uint8Array(await response.arrayBuffer());
   if(!bytes.length || bytes.length > MAX_IMAGE_BYTES || budget.bytes + bytes.length > MAX_SAVED_IMAGE_BYTES || !raster(bytes,type)) {mediaComplete=false;continue;}
   budget.bytes += bytes.length;
   const src = await storeImage(bytes,type);
   if(image.kind === 'avatar') saved.author.avatar = src;
   else if(image.kind === 'preview' && saved.preview) saved.preview.image = src;
   else saved.images.push({src,alt:image.alt});
  } catch { mediaComplete=false; /* Keep the last complete snapshot during refresh. */ }
 }
 return !mediaComplete && previous ? previous : saved;
}

/** Enrich only at publication/backfill, never during reads or page rendering. */
export async function enrichSocialSnapshots(markdown: string, fetcher: PublicFetcher = safePublicFetch, options: { refresh?: boolean; storeImage?: SocialImageStore; timeoutMs?: number; mastodonInstance?: string } = {}): Promise<string> {
 const match = markdown.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 if(!match) return markdown;
 const doc = parseDocument(match[1]);
 if(doc.errors.length) return markdown;
 const data = doc.toJS({maxAliasCount:0});
 const urls = [...new Set(['like-of','repost-of'].flatMap(k=> Array.isArray(data[k]) ? data[k] : typeof data[k] === 'string' ? [data[k]] : []).filter((u): u is string=> typeof u === 'string'))];
 const before = socialSnapshots(data[key]);
 const after: SocialSnapshot[] = [];
 const signal = AbortSignal.timeout(options.timeoutMs ?? 6000);
 const budget = {bytes:0};
 const retain = (s: SocialSnapshot) => {
  after.push(s);
 };
 for(const url of urls.slice(0,8)) {
  const existing = before.find(s=>s.url===url);
  if(existing && !options.refresh) {retain(existing);continue;}
  let fresh: SocialSnapshot | undefined;
  if(!signal.aborted) try {
   const source = Array.isArray(data['pesos-source']) ? data['pesos-source'][0] : undefined;
   const id = typeof source === 'string' ? source.match(/^mastodon:(?:like|repost):(\d+)$/)?.[1] : undefined;
   const mastodonSource = id && options.mastodonInstance ? {instance:publicUrl(options.mastodonInstance).origin,id} : undefined;
   fresh = await snapshot(url,fetcher,signal,budget,options.storeImage,existing,mastodonSource); } catch { /* Preserve saved originals when the platform is unavailable. */ }
  if(fresh) after.push(fresh);
  else if(existing) retain(existing);
 }
 if(JSON.stringify(before) === JSON.stringify(after) && (before.length || data[key] === undefined)) return markdown;
 if(after.length) doc.set(key,after); else doc.delete(key);
 const updated = `---\n${doc.toString()}---\n${markdown.slice(match[0].length)}`;
 // Preserve room for content and future bookkeeping within the GitHub store's 1 MiB limit.
 return new TextEncoder().encode(updated).length <= 900_000 ? updated : markdown;
}
