import { PHOTO_LIMITS, altLength, type SocialService } from '../../social-text';
import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from './public-fetch';
import { checkDeliveryResponse } from './webmention';

/** A photo of the post, as chosen for a social copy. */
export interface SyndicationPhoto { url: string; alt: string }
/** A photo read and fitted to one network's limits, ready to upload. */
export interface PreparedPhoto { bytes: Uint8Array<ArrayBuffer>; type: string; alt: string; width?: number; height?: number }
/** Where photos are read from, and what can shrink them. */
export interface PhotoSources {
 /** The media bucket behind `mediaBaseUrl`; photos there are read without a network fetch. */
 mediaBucket?: R2Bucket;
 mediaBaseUrl?: string;
 /** Cloudflare Images binding. It shrinks photos too large for a network. */
 images?: ImagesBinding;
 /** Fetches photos hosted elsewhere. */
 fetcher?: PublicFetcher;
}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

/** The type an image's bytes say they are, whatever its address or header claims. */
export function sniffImageType(bytes: Uint8Array): string | undefined {
 const starts = (...magic: number[]) => magic.every((byte, index) => bytes[index] === byte);
 const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
 if (starts(255, 216, 255)) return 'image/jpeg';
 if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return 'image/png';
 if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return 'image/gif';
 if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
 if (text(4, 8) === 'ftyp' && /avif|avis/.test(text(8, 32))) return 'image/avif';
}

/** Width and height from the image header, so Bluesky can lay a photo out before it loads. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 const type = sniffImageType(bytes);
 try {
  if (type === 'image/png') return { width: view.getUint32(16), height: view.getUint32(20) };
  if (type === 'image/gif') return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (type === 'image/webp') {
   const chunk = String.fromCharCode(...bytes.slice(12, 16));
   if (chunk === 'VP8X') return { width: 1 + (view.getUint32(24, true) & 0xffffff), height: 1 + (view.getUint32(27, true) & 0xffffff) };
   if (chunk === 'VP8L') { const bits = view.getUint32(21, true); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
   if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (type === 'image/jpeg') {
   let offset = 2;
   while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    // Start-of-frame markers carry the size; DHT (C4), JPG (C8) and DAC (CC) do not.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { offset += marker === 0xff ? 1 : 2; continue; }
    offset += 2 + view.getUint16(offset + 2);
   }
  }
 } catch { /* A truncated header has no size; the photo still sends. */ }
}

/** Read a photo: from the media bucket when it lives there, otherwise over the public Internet. */
async function readPhoto(url: string, sources: PhotoSources): Promise<Uint8Array<ArrayBuffer>> {
 publicUrl(url);
 const base = sources.mediaBaseUrl ? new URL(sources.mediaBaseUrl) : undefined;
 const link = new URL(url);
 if (sources.mediaBucket && base && link.origin === base.origin && !link.search) {
  const key = decodeURIComponent(link.pathname.slice(1));
  const object = key && !key.split('/').includes('..') ? await sources.mediaBucket.get(key) : null;
  if (object) {
   if (object.size > MAX_SOURCE_BYTES) throw new DeliveryError('A photo is larger than 25 MB', false);
   return new Uint8Array(await object.arrayBuffer());
  }
 }
 const fetcher = sources.fetcher ?? ((target, init) => safePublicFetch(target, init, fetch, MAX_SOURCE_BYTES));
 const response = await fetcher(url, { headers: { accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif' } });
 if (!response.ok) throw new DeliveryError(`A photo could not be read (HTTP ${response.status})`, response.status >= 500 || response.status === 429);
 return new Uint8Array(await response.arrayBuffer());
}

/** Steps from a light touch to a small file; most photos fit at the first. */
const SHRINK_STEPS = [[2048, 85], [2048, 75], [1600, 75], [1280, 70], [1024, 65]] as const;

/** Re-encode a photo as JPEG until it fits, keeping its aspect ratio. */
async function shrink(bytes: Uint8Array<ArrayBuffer>, maximum: number, images: ImagesBinding | undefined, service: SocialService): Promise<Uint8Array<ArrayBuffer>> {
 const name = service === 'bluesky' ? 'Bluesky' : 'Mastodon';
 if (!images) throw new DeliveryError(`A photo is too large for ${name} and cannot be shrunk here`, false);
 for (const [side, quality] of SHRINK_STEPS) {
  let output: Uint8Array<ArrayBuffer>;
  try {
   const result = await images.input(new Blob([bytes]).stream()).transform({ width: side, height: side, fit: 'scale-down' }).output({ format: 'image/jpeg', quality });
   output = new Uint8Array(await result.response().arrayBuffer());
  } catch { throw new DeliveryError(`A photo could not be shrunk for ${name}`, true); }
  if (output.length <= maximum) return output;
 }
 throw new DeliveryError(`A photo could not be made small enough for ${name}`, false);
}

/** Check the photos against the network's limits. Throws before anything is read or sent. */
export function checkPhotos(service: SocialService, photos: SyndicationPhoto[]): void {
 const limits = PHOTO_LIMITS[service];
 const name = service === 'bluesky' ? 'Bluesky' : 'Mastodon';
 if (photos.length > limits.count) throw new DeliveryError(`${name} takes up to ${limits.count} photos`, false);
 for (const photo of photos) if (altLength(photo.alt) > limits.alt) throw new DeliveryError(`${name} alt text is limited to ${limits.alt} characters`, false);
}

/** Read each photo and fit it to the network: its formats and its size per image. */
export async function preparePhotos(service: SocialService, photos: SyndicationPhoto[], sources: PhotoSources): Promise<PreparedPhoto[]> {
 checkPhotos(service, photos);
 const limits = PHOTO_LIMITS[service];
 return Promise.all(photos.map(async photo => {
  let bytes = await readPhoto(photo.url, sources);
  let type = sniffImageType(bytes);
  if (!type) throw new DeliveryError('A photo is not an image either network accepts', false);
  if (bytes.length > limits.bytes || !limits.types.includes(type)) { bytes = await shrink(bytes, limits.bytes, sources.images, service); type = 'image/jpeg'; }
  return { bytes, type, alt: photo.alt.trim(), ...imageSize(bytes) };
 }));
}

/** Upload photos to Mastodon with their descriptions, waiting for any still processing. */
export async function uploadMastodonMedia(base: string, token: string, photos: PreparedPhoto[], fetcher: PublicFetcher, wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))): Promise<string[]> {
 const ids: string[] = [];
 for (const [index, photo] of photos.entries()) {
  const form = new FormData();
  form.append('file', new Blob([photo.bytes], { type: photo.type }), `photo-${index + 1}.${extensions[photo.type] ?? 'jpg'}`);
  if (photo.alt) form.append('description', photo.alt);
  const response = await fetcher(base + '/api/v2/media', { method: 'POST', redirect: 'manual', headers: { authorization: `Bearer ${token}` }, body: form });
  checkDeliveryResponse(response);
  let media: { id?: unknown; url?: unknown };
  try { media = await response.json() as typeof media; } catch { throw new DeliveryError('Invalid Mastodon media response', true); }
  if (typeof media.id !== 'string' || !/^[\w-]+$/.test(media.id)) throw new DeliveryError('Mastodon did not return a media id', true);
  // 202 means Mastodon is still processing; a status cannot attach it until it has a URL.
  for (let attempt = 0; response.status === 202 && !media.url && attempt < 10; attempt++) {
   await wait(1000);
   const check = await fetcher(`${base}/api/v1/media/${media.id}`, { redirect: 'manual', headers: { authorization: `Bearer ${token}` } });
   if (check.status === 206) continue;
   checkDeliveryResponse(check);
   media = await check.json() as typeof media;
  }
  ids.push(media.id as string);
 }
 return ids;
}

/** Upload photos as Bluesky blobs and describe them as an images embed. */
export async function blueskyImagesEmbed(base: string, accessJwt: string, photos: PreparedPhoto[], fetcher: PublicFetcher): Promise<Record<string, unknown>> {
 const images = [];
 for (const photo of photos) {
  const response = await fetcher(base + '/xrpc/com.atproto.repo.uploadBlob', { method: 'POST', redirect: 'manual', headers: { authorization: `Bearer ${accessJwt}`, 'content-type': photo.type }, body: photo.bytes });
  checkDeliveryResponse(response);
  let result: { blob?: unknown };
  try { result = await response.json() as typeof result; } catch { throw new DeliveryError('Invalid Bluesky blob response', true); }
  if (!result.blob || typeof result.blob !== 'object') throw new DeliveryError('Bluesky did not return a blob', true);
  images.push({ alt: photo.alt, image: result.blob, ...(photo.width && photo.height ? { aspectRatio: { width: photo.width, height: photo.height } } : {}) });
 }
 return { $type: 'app.bsky.embed.images', images };
}
