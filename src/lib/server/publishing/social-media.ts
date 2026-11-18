import type { Properties } from './document';
import { safePublicImageFetch, safePublicVideoStream, publicUrl, DeliveryError, type PublicFetcher } from './public-fetch';
export type SocialImageStore = (bytes: Uint8Array, contentType: string) => Promise<string>;
const extensions: Record<string,string> = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','video/mp4':'mp4'};
export async function socialImageKey(bytes: Uint8Array, contentType: string): Promise<string> {
 const extension = extensions[contentType];
 if(!extension) throw new Error('Unsupported saved image');
 const digest = await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
 const hash = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return `social/${hash}.${extension}`;
}
function mediaOrigin(me: string, mediaBaseUrl?: string): URL {
 const origin = new URL(mediaBaseUrl ?? me);
 if(origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid media origin');
 return origin;
}
/** Content-addressed objects are immutable and shared by repeated snapshots. */
export function socialImageStore(bucket: R2Bucket | undefined, me: string, mediaBaseUrl?: string): SocialImageStore | undefined {
 if(!bucket) return;
 const origin = mediaOrigin(me,mediaBaseUrl);
 return async(bytes,contentType)=> {
  const key = await socialImageKey(bytes,contentType);
  const stored = await bucket.put(`publishing/${key}`,new Uint8Array(bytes),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType,cacheControl:'public, max-age=31536000, immutable'}});
  // A failed condition means these exact content-addressed bytes already exist.
  if(!stored && !(await bucket.head(`publishing/${key}`))) throw new Error('Image storage unavailable');
  return new URL(`${mediaBaseUrl ? 'publishing' : 'media'}/${key}`,origin).href;
 };
}

/** The SHA-256 inside an atproto blob CID (CIDv1, raw codec, sha2-256), as hex. */
export function blobSha256(cid: string): string | undefined {
 if(!/^b[a-z2-7]{50,70}$/.test(cid)) return;
 const alphabet='abcdefghijklmnopqrstuvwxyz234567'; const bytes:number[]=[]; let bits=0, value=0;
 for(const c of cid.slice(1)) { value=(value<<5|alphabet.indexOf(c))&0xffff; bits+=5; if(bits>=8) { bits-=8; bytes.push(value>>bits&255); } }
 if(bytes.length!==36 || bytes[0]!==1 || bytes[1]!==0x55 || bytes[2]!==0x12 || bytes[3]!==0x20) return;
 return bytes.slice(4).map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** An MP4 starts with an ftyp box; AVIF images use the same container. */
export function mp4Start(bytes: Uint8Array): boolean {
 return String.fromCharCode(...bytes.slice(4,8)) === 'ftyp' && !/avif|avis/.test(String.fromCharCode(...bytes.slice(8,64)));
}
/** Saves a public MP4 and returns its saved address. With a known SHA-256 (a Bluesky blob CID) the
 * bytes stream straight into R2, which checks the digest, so a 100 MB video never sits in memory;
 * without one (Mastodon) the video is read whole, up to 40 MB, and hashed. */
export type SocialVideoStore = (url: string, sha256?: string) => Promise<string>;
const MAX_BUFFERED_VIDEO_BYTES = 40 * 1024 * 1024;
export function socialVideoStore(bucket: R2Bucket | undefined, me: string, mediaBaseUrl?: string, fetcher: PublicFetcher = safePublicVideoStream, timeoutMs = 90_000): SocialVideoStore | undefined {
 if(!bucket) return;
 const origin = mediaOrigin(me,mediaBaseUrl);
 const address = (key: string) => new URL(`${mediaBaseUrl ? 'publishing' : 'media'}/${key}`,origin).href;
 const metadata = {httpMetadata:{contentType:'video/mp4',cacheControl:'public, max-age=31536000, immutable'}};
 return async(url,sha256)=> {
  if(sha256 !== undefined && !/^[a-f0-9]{64}$/.test(sha256)) throw new DeliveryError('Invalid video digest',false);
  if(sha256 && await bucket.head(`publishing/social/${sha256}.mp4`)) return address(`social/${sha256}.mp4`);
  publicUrl(url);
  const response = await fetcher(url,{headers:{accept:'video/mp4'},signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok || !response.body) { await response.body?.cancel(); throw new DeliveryError('Video unavailable',response.status >= 500 || response.status === 429); }
  if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'video/mp4') { await response.body.cancel(); throw new DeliveryError('Not an MP4 video',false); }
  const length = Number(response.headers.get('content-length'));
  if(!sha256) {
   if(length > MAX_BUFFERED_VIDEO_BYTES) { await response.body.cancel(); throw new DeliveryError('Video too large',false); }
   const bytes = new Uint8Array(await response.arrayBuffer());
   if(!bytes.length || bytes.length > MAX_BUFFERED_VIDEO_BYTES || !mp4Start(bytes)) throw new DeliveryError('Not an MP4 video',false);
   const key = await socialImageKey(bytes,'video/mp4');
   const stored = await bucket.put(`publishing/${key}`,bytes,{onlyIf:{etagDoesNotMatch:'*'},...metadata});
   if(!stored && !(await bucket.head(`publishing/${key}`))) throw new DeliveryError('Video storage unavailable',true);
   return address(key);
  }
  // Check the container from the first bytes, then pass the rest through untouched.
  let head = new Uint8Array(0); let checked = false;
  const checkedBody = response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
   transform(chunk,controller) {
    if(checked) { controller.enqueue(chunk); return; }
    const joined = new Uint8Array(head.length + chunk.length); joined.set(head); joined.set(chunk,head.length); head = joined;
    if(head.length < 64) return;
    if(!mp4Start(head)) { controller.error(new DeliveryError('Not an MP4 video',false)); return; }
    checked = true; controller.enqueue(head);
   },
   flush(controller) { if(!checked) { if(head.length >= 12 && mp4Start(head)) controller.enqueue(head); else controller.error(new DeliveryError('Not an MP4 video',false)); } }
  }));
  // R2 needs a known length for a streamed body.
  const Fixed = (globalThis as {FixedLengthStream?: new (length: number) => TransformStream<Uint8Array,Uint8Array>}).FixedLengthStream;
  const body = Fixed ? checkedBody.pipeThrough(new Fixed(length)) : checkedBody;
  try { await bucket.put(`publishing/social/${sha256}.mp4`,body,{sha256,...metadata}); }
  catch(error) { throw error instanceof DeliveryError ? error : new DeliveryError('Video storage failed',true); }
  return address(`social/${sha256}.mp4`);
 };
}

const savedPath=/\/(?:publishing|media)\/social\/[a-f0-9]{64}\./;
/** Fetch a public raster image, check its bytes match its type, and save it. */
async function archiveImage(url:string, store:SocialImageStore, fetcher:PublicFetcher):Promise<string> {
 publicUrl(url);const response=await fetcher(url,{headers:{accept:'image/png,image/jpeg,image/webp,image/gif'},signal:AbortSignal.timeout(30_000)});
 if(!response.ok)throw new Error('Image unavailable');
 const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()??'';
 const bytes=new Uint8Array(await response.arrayBuffer());
 const starts=(...magic:number[])=>magic.every((v,i)=>bytes[i]===v);
 const ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
 const valid=type==='image/png'&&starts(137,80,78,71,13,10,26,10)||type==='image/jpeg'&&starts(255,216,255)||type==='image/gif'&&['GIF87a','GIF89a'].includes(ascii(0,6))||type==='image/webp'&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
 if(!valid||!bytes.length||bytes.length>10*1024*1024)throw new Error('Invalid image');
 return store(bytes,type);
}
/** Save link card thumbnails; a card whose image cannot be saved keeps its text and drops the image. */
export async function archiveLinkPreviewProperties(properties:Properties, store:SocialImageStore|undefined, fetcher:PublicFetcher=safePublicImageFetch):Promise<Properties> {
 const previews=properties._micropubLinkPreviews;
 if(!previews?.length)return properties;
 const saved=[];
 for(const preview of previews){
  if(!preview||typeof preview!=='object'||Array.isArray(preview)){saved.push(preview);continue;}
  const {image,...rest}=preview;
  if(typeof image!=='string'||savedPath.test(image)){saved.push(preview);continue;}
  try{saved.push(store?{...rest,image:await archiveImage(image,store,fetcher)}:rest);}catch{saved.push(rest);}
 }
 return {...properties,_micropubLinkPreviews:saved};
}
/** Preserve full-resolution imported photos, alt text and unrelated properties. */
export async function archivePhotoProperties(properties:Properties, store:SocialImageStore|undefined, fetcher:PublicFetcher=safePublicImageFetch):Promise<Properties> {
 if(!store||!properties.photo?.length)return properties;
 const photos=[];
 for(const photo of properties.photo){
  const url=typeof photo==='string'?photo:photo&&typeof photo==='object'&&!Array.isArray(photo)?photo.url:undefined;
  if(typeof url!=='string'||savedPath.test(url)){photos.push(photo);continue;}
  try{
   const saved=await archiveImage(url,store,fetcher);photos.push(typeof photo==='string'?saved:{...photo as object,url:saved});
  }catch{photos.push(photo);}
 }
 return {...properties,photo:photos as Properties['photo']};
}
