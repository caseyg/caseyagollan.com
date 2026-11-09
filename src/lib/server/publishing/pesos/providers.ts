import { sanitizePublishingHtml } from '../../../utils/sanitizeHtml';
import type { Properties } from '../document';

export interface Activity {
 id: string;
 service: 'mastodon' | 'bluesky';
 kind: 'post' | 'like' | 'repost';
 url: string;
 target?: string;
 published: string;
 dateSource?: 'activity' | 'original-post';
 properties: Properties;
}
export interface Page { activities: Activity[]; ids: string[]; cursor?: string }
export type GetJson = (url: string, headers?: Record<string,string>) => Promise<{data: any; link?: string}>;
const iso = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function mastodonActivity(status: any, kind: Activity['kind'], now: string): Activity | undefined {
 const original = status.reblog ?? status;
 if (original.account?.locked === true || original.visibility !== 'public' || (kind === 'post' && status.visibility !== 'public') || !iso(original.created_at) || typeof original.url !== 'string') return;
 const action = status.reblog ? 'repost' : kind;
 // Missing account metadata is not evidence that an interaction is safe to archive.
 if (action !== 'post' && original.account?.locked !== false) return;
 const published = action === 'like' || !iso(status.created_at) ? original.created_at : status.created_at;
 if (!iso(published) || typeof status.id !== 'string') return;
 const properties: Properties = {};
 if (action === 'post') {
  properties.content = [{ html: sanitizePublishingHtml(String(status.content ?? '')) }];
  if (status.in_reply_to_id && status.in_reply_to_account_id) {
   // This local status URL is resolvable even when the replied-to author is remote.
   properties['in-reply-to'] = [new URL(`/web/statuses/${status.in_reply_to_id}`, status.url).href];
  }
  for (const media of status.media_attachments ?? []) {
   if (typeof media.url !== 'string') continue;
   const key = media.type === 'image' ? 'photo' : ['video','gifv'].includes(media.type) ? 'video' : media.type === 'audio' ? 'audio' : undefined;
   if (key) (properties[key] ??= []).push({url: media.url, alt: String(media.description ?? '')});
  }
  const quoted=status.quote?.state==='accepted'?status.quote.quoted_status:undefined;
  if(typeof quoted?.url==='string')properties['quotation-of']=[quoted.url];
  if (status.spoiler_text) properties.summary = [status.spoiler_text];
 }
 return {id:`mastodon:${action}:${status.id}`,service:'mastodon',kind:action,url:status.url ?? original.url,target:action === 'post' ? undefined : original.url,published,...(action === 'like' ? {dateSource:'original-post' as const} : {}),properties};
}
export function blueUrl(uri: string): string {
 const match = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)$/);
 if (!match) throw new Error('Invalid Bluesky post URI');
 return `https://bsky.app/profile/${match[1]}/post/${match[2]}`;
}
export function blueskyActivity(record: any, kind: Activity['kind']): Activity | undefined {
 const value = record.value;
 if (!iso(value?.createdAt) || typeof record.uri !== 'string') return;
 if (kind !== 'post' && (typeof value.subject?.uri !== 'string' || !/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/[a-zA-Z0-9]+$/.test(value.subject.uri))) return;
 const properties: Properties = {};
 if (kind === 'post') {
  if (typeof value.text !== 'string') return;
  properties.content = [value.text];
  if (value.reply?.parent?.uri) properties['in-reply-to'] = [blueUrl(value.reply.parent.uri)];
  const embed = value.embed?.$type === 'app.bsky.embed.recordWithMedia' ? value.embed.media : value.embed;
  const actor = record.uri.split('/')[2];
  for (const image of embed?.images ?? []) {
   const cid = image.image?.ref?.$link;
   if (typeof cid === 'string') (properties.photo ??= []).push({url:`https://cdn.bsky.app/img/feed_fullsize/plain/${actor}/${cid}@jpeg`,alt:String(image.alt ?? '')});
  }
  // Preserve external links and quoted post references alongside the original text.
  const links: string[] = (value.facets ?? []).flatMap((f: any)=>(f.features ?? []).filter((x:any)=>x.$type === 'app.bsky.richtext.facet#link' && typeof x.uri === 'string').map((x:any)=>x.uri));
  if (embed?.external?.uri) links.push(embed.external.uri);
  const quote = value.embed?.record?.record?.uri ?? value.embed?.record?.uri;
  if (quote) {links.push(blueUrl(quote));properties['quotation-of']=[blueUrl(quote)];}
  const missing = [...new Set(links)].filter(link=>!value.text.includes(link));
  if (missing.length) properties.content = [value.text + '\n\n' + missing.join('\n')];
  if (embed?.video?.ref?.$link) properties.video = [{url:`https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(actor)}&cid=${encodeURIComponent(embed.video.ref.$link)}`,alt:String(embed.alt ?? '')}];
 }
 const target = kind === 'post' ? undefined : blueUrl(value.subject.uri);
 return {id:record.uri,service:'bluesky',kind,url:kind === 'post' ? blueUrl(record.uri) : target!,target,published:value.createdAt,properties};
}

/** Use current, verified handles for Bridgy's syndication URL matching.
 * Keep AT source IDs and other authors' relationship targets unchanged.
 */
export function blueskySyndicationUrls(get: GetJson): (activity: Activity) => Promise<void> {
 const profiles = new Map<string,Promise<string>>();
 return async activity => {
  if (activity.service !== 'bluesky' || activity.kind !== 'post') return;
  const actor = activity.id.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/[a-zA-Z0-9]+$/)?.[1];
  if (!actor) throw new Error('Invalid Bluesky post URI');
  if (!profiles.has(actor)) profiles.set(actor,(async () => {
   const {data} = await get(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?${new URLSearchParams({actor})}`);
   if (data?.did !== actor || typeof data.handle !== 'string' || !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(data.handle) || data.handle === 'handle.invalid') throw new Error('Unable to resolve Bluesky syndication handle');
   return data.handle.toLowerCase();
  })());
  const handle = await profiles.get(actor)!;
  activity.url = blueUrl(activity.id).replace(`/profile/${actor}/`,`/profile/${handle}/`);
 };
}

export async function mastodonPage(get: GetJson, instance: string, token: string, account: string, kind: 'post' | 'like', cursor?: string, now = new Date().toISOString()): Promise<Page> {
 const url = new URL(kind === 'like' ? '/api/v1/favourites' : `/api/v1/accounts/${account}/statuses`,instance);
 url.searchParams.set('limit','40');
 if (cursor) url.searchParams.set('max_id',cursor);
 const {data,link} = await get(url.href,{Authorization:`Bearer ${token}`});
 if (!Array.isArray(data)) throw new Error('Invalid Mastodon page');
 const next = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
 const nextUrl = next ? new URL(next) : undefined;
 return {ids:data.map(status=>`mastodon:${kind}:${status.id}`),activities:data.map(status=>mastodonActivity(status,kind,now)).filter((a):a is Activity=>!!a),cursor:nextUrl?.searchParams.get('max_id') ?? undefined};
}
export async function blueskyPage(get: GetJson, service: string, did: string, kind: Activity['kind'], cursor?: string): Promise<Page> {
 const collection = `app.bsky.feed.${kind === 'post' ? 'post' : kind}`;
 const url = new URL('/xrpc/com.atproto.repo.listRecords',service);
 url.search = new URLSearchParams({repo:did,collection,limit:'40',...(cursor ? {cursor} : {})}).toString();
 const {data} = await get(url.href);
 if (!Array.isArray(data.records)) throw new Error('Invalid Bluesky page');
 const activities: Activity[] = [];
 for (const record of data.records) {
  const activity = blueskyActivity(record,kind);
  if (!activity) continue;
  if (kind !== 'post' && !await blueskyPublic(get,record.value.subject.uri)) continue;
  activities.push(activity);
 }
 return {ids:data.records.map((r:any)=>r.uri),activities,cursor:data.cursor};
}

/** Respect public-access opt-outs as well as explicit account/post restrictions. */
export function publicBluesky(value: any): boolean {
 return value && value.visibility === undefined && value.locked !== true && value.private !== true &&
  !(value.labels ?? []).some((label: any)=>['!no-unauth','!no-unauthenticated','!hide','!takedown'].includes(label.val)) &&
  !value.viewer?.blockedBy && !value.viewer?.blocking && !value.deactivated;
}

/** Fail closed when public access cannot be established, including no-unauth labels. */
export async function blueskyPublic(get: GetJson, uri: string): Promise<boolean> {
 try {
  const {data} = await get(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`);
  const post = data?.thread?.post;
  if (data?.thread?.$type !== 'app.bsky.feed.defs#threadViewPost' || !post || post.uri !== uri || typeof post.record?.text !== 'string' || typeof post.author?.did !== 'string' || !publicBluesky(post) || !publicBluesky(post.author)) return false;
  const {data:profile} = await get(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?${new URLSearchParams({actor:post.author.did})}`);
  return profile?.did === post.author.did && publicBluesky(profile);
 } catch (error) {
  // Deleted targets must not stall the rest of a likes/reposts page forever.
  if (error && typeof error === 'object' && 'status' in error && [400,404,410].includes(Number(error.status))) return false;
  throw error;
 }
}
