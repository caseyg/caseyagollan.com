import { sanitizePublishingHtml } from '../../../utils/sanitizeHtml';
import { CarReader } from '@ipld/car';
import * as cbor from '@ipld/dag-cbor';
import { publicUrl } from '../public-fetch';
import { blueskyActivity, mastodonActivity, type GetJson, type Activity } from './providers';

function xrpcLinks(value: any): any {
 if (value && value.asCID === value) return {$link:value.toString()};
 if (Array.isArray(value)) return value.map(xrpcLinks);
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,xrpcLinks(item)]));
 return value;
}

/** Traverse the committed MST, never orphaned records left in a CAR. */
export async function blueskyArchive(bytes: Uint8Array): Promise<Activity[]> {
 const car = await CarReader.fromBytes(bytes);
 const roots = await car.getRoots();
 if (roots.length !== 1) throw new Error('Expected one repository root');
 const read = async (cid: any): Promise<any> => {
  const block = await car.get(cid);
  if (!block) throw new Error('Missing repository block');
  return cbor.decode(block.bytes);
 };
 const commit = await read(roots[0]);
 if (typeof commit.did !== 'string' || !commit.data) throw new Error('Invalid repository commit');
 const activities: Activity[] = [];
 const visited = new Set<string>();
 const walk = async (cid: any) => {
  if (visited.has(String(cid))) throw new Error('Repeated MST node');
  visited.add(String(cid));
  const node = await read(cid);
  if (node.l) await walk(node.l);
  let previous = new Uint8Array();
  for (const entry of node.e) {
   const key = new Uint8Array(entry.p + entry.k.length);
   key.set(previous.slice(0,entry.p)); key.set(entry.k,entry.p); previous = key;
   const path = new TextDecoder().decode(key);
   const match = path.match(/^app\.bsky\.feed\.(post|like|repost)\/[^/]+$/);
   if (match) {
    // CAR CIDs must use the same {$link} shape as XRPC blob references.
    const activity = blueskyActivity({uri:`at://${commit.did}/${path}`,value:xrpcLinks(await read(entry.v))},match[1] as Activity['kind']);
    if (activity) activities.push({...activity,dateSource:'activity'});
   }
   if (entry.t) await walk(entry.t);
  }
 };
 await walk(commit.data);
 return activities;
}

/** ActivityStreams exports: only explicitly public objects qualify. Remote objects
 * (including likes.json URL entries) require live resolution by the caller. */
export function mastodonArchiveItems(data: any): any[] {
 if (Array.isArray(data)) return data;
 if (Array.isArray(data.orderedItems)) return data.orderedItems;
 if (Array.isArray(data.items)) return data.items;
 throw new Error('Expected an ActivityStreams collection or likes array');
}
export function mastodonArchiveActivity(item: any): Activity | undefined {
 const object = item.object;
 if (!object || typeof object !== 'object') return;
 if (!publicAudience(object.to)) return;
 if (item.to !== undefined && !publicAudience(item.to)) return;
 const kind = item.type === 'Create' ? 'post' : item.type === 'Announce' ? 'repost' : item.type === 'Like' ? 'like' : undefined;
 const url = typeof object.url === 'string' ? object.url : object.id;
 const hasActivityDate = typeof item.published === 'string' && Number.isFinite(Date.parse(item.published));
 const published = hasActivityDate ? item.published : object.published;
 if (!kind || typeof url !== 'string' || !Number.isFinite(Date.parse(published))) return;
 const properties: Activity['properties'] = kind === 'post' ? {content:[{html:sanitizePublishingHtml(String(object.content ?? ''))}]} : {};
 if (kind === 'post') {
  for (const media of object.attachment ?? []) {
   const key = String(media.mediaType).startsWith('image/') ? 'photo' : String(media.mediaType).startsWith('video/') ? 'video' : String(media.mediaType).startsWith('audio/') ? 'audio' : undefined;
   if (key && typeof media.url === 'string') (properties[key] ??= []).push({url:media.url,alt:String(media.name ?? '')});
  }
  if (object.summary) properties.summary = [String(object.summary)];
 }
 return {id:`mastodon:archive:${item.id}`,service:'mastodon',kind,url,target:kind === 'post' ? undefined : url,published,dateSource:hasActivityDate ? 'activity' : 'original-post',properties};
}

const publicAudience = (value: unknown) => (Array.isArray(value) ? value : [value]).includes('https://www.w3.org/ns/activitystreams#Public');
export function mastodonStatusLocation(value: string): { origin: string; id: string } | undefined {
 const url = publicUrl(value);
 const id = url.pathname.match(/^\/(?:users\/[^/]+\/statuses\/|@[^/]+\/|web\/statuses\/)(\d+)\/?$/)?.[1];
 return id ? {origin:url.origin,id} : undefined;
}

/** Export URL-only likes and Announce targets need a live anonymous status lookup.
 * Never interpret an unknown activity type as a like, or a private envelope as public. */
export async function resolveMastodonArchiveItem(item: any, get: GetJson): Promise<Activity | undefined> {
 const kind = typeof item === 'string' || item?.type === 'Like' ? 'like' : item?.type === 'Announce' ? 'repost' : item?.type === 'Create' ? 'post' : undefined;
 if (!kind) return;
 if (typeof item !== 'string' && kind !== 'like' && !publicAudience(item.to)) return;
 if (kind === 'post' && (!item.object || typeof item.object !== 'object' || !publicAudience(item.object.to))) return;
 const object = typeof item === 'string' ? item : item.object;
 const value = typeof object === 'string' ? object : object?.url ?? object?.id;
 if (typeof value !== 'string') return;
 const location = mastodonStatusLocation(value);
 if (!location) return;
 const {data:status} = await get(`${location.origin}/api/v1/statuses/${location.id}`);
 // Require a genuine account privacy result, not a partial status-shaped response.
 if (status.account?.locked !== false || status.reblog || String(status.id) !== location.id) return;
 const activity = mastodonActivity(status,kind,'');
 if (!activity) return;
 const canonical = publicUrl(status.url).href;
 // Remote status IDs belong to their own servers, not the polling instance's
 // local ID namespace. The canonical target still deduplicates both import paths.
 if (kind === 'like') activity.id = `mastodon:archive:like:${canonical}`;
 const hasActivityDate = typeof item?.published === 'string' && Number.isFinite(Date.parse(item.published));
 activity.published = hasActivityDate ? item.published : status.created_at;
 activity.dateSource = hasActivityDate ? 'activity' : 'original-post';
 if (kind === 'post') {
  // Live media URLs replace archive-relative paths that don't exist on this site.
  // Preserve the archive's canonical reply target instead of an instance-local ID.
  if (typeof object.inReplyTo === 'string') activity.properties['in-reply-to'] = [publicUrl(object.inReplyTo).href];
  const tags = (object.tag ?? []).filter((tag:any)=>tag.type === 'Hashtag' && typeof tag.name === 'string').map((tag:any)=>tag.name.replace(/^#/,''));
  if (tags.length) activity.properties.category = [...new Set<string>(tags)];
 }
 if (kind === 'repost') {
  const source = typeof item.id === 'string' ? item.id.match(/\/statuses\/(\d+)\/activity$/)?.[1] : undefined;
  activity.id = source ? `mastodon:repost:${source}` : `mastodon:archive:${item.id}`;
  // The repost's syndication URL is the wrapper, not the original post.
  if (source && typeof item.actor === 'string') activity.url = `${new URL(item.actor).origin}/web/statuses/${source}`;
 }
 return activity;
}
