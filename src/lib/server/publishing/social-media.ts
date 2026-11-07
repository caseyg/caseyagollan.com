import type { Properties } from './document';
import { safePublicImageFetch, publicUrl, type PublicFetcher } from './public-fetch';
export type SocialImageStore = (bytes: Uint8Array, contentType: string) => Promise<string>;
const extensions: Record<string,string> = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'};
export async function socialImageKey(bytes: Uint8Array, contentType: string): Promise<string> {
 const extension = extensions[contentType];
 if(!extension) throw new Error('Unsupported saved image');
 const digest = await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
 const hash = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return `social/${hash}.${extension}`;
}
/** Content-addressed objects are immutable and shared by repeated snapshots. */
export function socialImageStore(bucket: R2Bucket | undefined, me: string, mediaBaseUrl?: string): SocialImageStore | undefined {
 if(!bucket) return;
 const origin = new URL(mediaBaseUrl ?? me);
 if(origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid media origin');
 return async(bytes,contentType)=> {
  const key = await socialImageKey(bytes,contentType);
  const stored = await bucket.put(`publishing/${key}`,new Uint8Array(bytes),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType,cacheControl:'public, max-age=31536000, immutable'}});
  // A failed condition means these exact content-addressed bytes already exist.
  if(!stored && !(await bucket.head(`publishing/${key}`))) throw new Error('Image storage unavailable');
  return new URL(`${mediaBaseUrl ? 'publishing' : 'media'}/${key}`,origin).href;
 };
}

/** Preserve full-resolution imported photos, alt text and unrelated properties. */
export async function archivePhotoProperties(properties:Properties, store:SocialImageStore|undefined, fetcher:PublicFetcher=safePublicImageFetch):Promise<Properties> {
 if(!store||!properties.photo?.length)return properties;
 const photos=[];
 for(const photo of properties.photo){
  const url=typeof photo==='string'?photo:photo&&typeof photo==='object'&&!Array.isArray(photo)?photo.url:undefined;
  if(typeof url!=='string'||/\/(?:publishing|media)\/social\/[a-f0-9]{64}\./.test(url)){photos.push(photo);continue;}
  try{
   publicUrl(url);const response=await fetcher(url,{headers:{accept:'image/png,image/jpeg,image/webp,image/gif'},signal:AbortSignal.timeout(30_000)});
   if(!response.ok)throw new Error('Photo unavailable');
   const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()??'';
   const bytes=new Uint8Array(await response.arrayBuffer());
   const starts=(...magic:number[])=>magic.every((v,i)=>bytes[i]===v);
   const ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
   const valid=type==='image/png'&&starts(137,80,78,71,13,10,26,10)||type==='image/jpeg'&&starts(255,216,255)||type==='image/gif'&&['GIF87a','GIF89a'].includes(ascii(0,6))||type==='image/webp'&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
   if(!valid||!bytes.length||bytes.length>10*1024*1024)throw new Error('Invalid photo');
   const saved=await store(bytes,type);photos.push(typeof photo==='string'?saved:{...photo as object,url:saved});
  }catch{photos.push(photo);}
 }
 return {...properties,photo:photos as Properties['photo']};
}
