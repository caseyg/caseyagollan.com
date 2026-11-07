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
