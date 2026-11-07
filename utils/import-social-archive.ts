import { parseDocument } from 'yaml';
import { resolve } from 'node:path';
import { blueskyArchive, mastodonArchiveItems, mastodonStatusLocation, resolveMastodonArchiveItem } from '../src/lib/server/publishing/pesos/archives';
import { activityDocument, alreadyRepresented, indexIdentities, identity } from '../src/lib/server/publishing/pesos/importer';
import { blueskyPublic, type GetJson, type Activity } from '../src/lib/server/publishing/pesos/providers';
import { readDocument } from '../src/lib/server/publishing/document';
import { safePublicFetch, publicUrl } from '../src/lib/server/publishing/public-fetch';

const args = process.argv.slice(2);
const inputs = args.filter(a=>!a.startsWith('--'));
if (!inputs.length || args.some(a=>a.startsWith('--') && a !== '--write')) throw new Error('Usage: bun utils/import-social-archive.ts FILE.car|outbox.json|likes.json [...] [--write]');
const root = resolve('content');
const paths = await Array.fromAsync(new Bun.Glob('*/*.md').scan({cwd:root}));
if (!paths.length) throw new Error('Initialize the canonical content checkout first');
const entries = await Promise.all(paths.map(async path=>({path,properties:readDocument(await Bun.file(resolve(root,path)).text()).properties})));
class LookupError extends Error {
 constructor(readonly status: number) { super(`Public verification failed: ${status}`); }
}
const responses = new Map<string,Promise<{data:any}>>();
const request: GetJson = async url => {
 publicUrl(url);
 for (let attempt=0;attempt<3;attempt++) {
  const response = await safePublicFetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if (response.ok) return {data:await response.json()};
  if (attempt === 2 || ![429,502,503,504].includes(response.status)) throw new LookupError(response.status);
  const retry = response.headers.get('retry-after');
  const reset = Date.parse(response.headers.get('x-ratelimit-reset') ?? '');
  const delay = retry ? (/^\d+$/.test(retry) ? Number(retry)*1000 : Date.parse(retry)-Date.now()) : Number.isFinite(reset) ? reset-Date.now() : 30_000;
  console.log(JSON.stringify({event:'public_lookup_retry',host:new URL(url).hostname,status:response.status}));
  await Bun.sleep(Math.min(5*60_000,Math.max(1000,Number.isFinite(delay) ? delay+1000 : 30_000)));
 }
 throw new Error('Public verification exhausted retries');
};
const get: GetJson = url => {
 if (!responses.has(url)) responses.set(url,request(url));
 return responses.get(url)!;
};
async function mapBounded<T,R>(values:T[], fn:(value:T)=>Promise<R>):Promise<R[]> {
 const results = new Array<R>(values.length);
 let next = 0;
 await Promise.all(Array.from({length:8},async()=>{
  while (next < values.length) {const i=next++;results[i]=await fn(values[i]);}
 }));
 return results;
}
const actors: Record<string,string> = {};
const handles = new Set<string>();
for (const entry of entries) for (const values of Object.values(entry.properties)) for (const value of values) {
 if (typeof value !== 'string') continue;
 const handle = value.match(/^https:\/\/bsky.app\/profile\/([^/]+)\/post\//)?.[1];
 if (handle && !handle.startsWith('did:')) handles.add(handle.toLowerCase());
}
await mapBounded([...handles],async handle=>{
 const {data} = await get(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
 if (typeof data.did !== 'string') throw new Error('Unable to resolve Bluesky identity');
 actors[handle] = data.did;
});
if (inputs.some(input=>!input.endsWith('.car'))) {
 const urls = new Set(entries.flatMap(e=>[...(e.properties['like-of'] ?? []),...(e.properties['repost-of'] ?? [])]).filter((v):v is string=>typeof v === 'string'));
 await mapBounded([...urls],async value=>{
  const location = mastodonStatusLocation(value);
  if (!location) return;
  const parsed = publicUrl(value);
  // Author-origin /@name/ID and /users/name/statuses/ID forms already
  // normalize to the same identity. Only instance-local aliases need lookup.
  if (!/^\/(?:@[^/]+@[^/]+\/|web\/statuses\/)\d+\/?$/.test(parsed.pathname)) return;
  try {
   const {data} = await get(`${location.origin}/api/v1/statuses/${location.id}`);
   actors[parsed.origin + parsed.pathname.replace(/\/$/,'')] = publicUrl(data.url).href;
  } catch (error) {
   // Deleted originals cannot pass live verification and hence cannot be duplicated.
   if (!(error instanceof LookupError) || ![404,410].includes(error.status)) throw error;
  }
 });
}
const keys = indexIdentities(entries,actors);
for (const input of inputs) {
 const counts = {mode:args.includes('--write') ? 'write' : 'dry-run',input:input.split('/').pop(),total:0,imported:0,updated:0,duplicates:0,restrictedOrUnsupported:0,unavailable:0};
 const byKind: Record<string,number> = {};
 const unavailableReasons: Record<string,number> = {};
 const unavailable = (error:unknown) => {counts.unavailable++;const reason = error instanceof LookupError ? `http-${error.status}` : 'network-or-invalid-response';unavailableReasons[reason]=(unavailableReasons[reason] ?? 0)+1;};
 let activities: Activity[];
 if (input.endsWith('.car')) {
  activities = await blueskyArchive(new Uint8Array(await Bun.file(input).arrayBuffer()));
  counts.total = activities.length;
  const checked = await mapBounded(activities,async activity=>{
   try {
    const existing = entries.find(e=>alreadyRepresented(activity,indexIdentities([e],actors),actors));
    if (existing) {
     const needsDate = activity.kind !== 'post' && existing.properties['pesos-source']?.length && Math.floor(Date.parse(String(existing.properties.published?.[0]))/1000) !== Math.floor(Date.parse(activity.published)/1000);
     if (!needsDate) return activity;
    }

    const uri = activity.kind === 'post' ? activity.id : activity.target!.replace(/^https:\/\/bsky.app\/profile\/([^/]+)\/post\/(.+)$/, 'at://$1/app.bsky.feed.post/$2');
    if (await blueskyPublic(get,uri)) return activity;
    counts.restrictedOrUnsupported++;
   } catch (error) {unavailable(error);}
  });
  activities = checked.filter((a):a is Activity=>!!a);
 } else {
  const items = mastodonArchiveItems(await Bun.file(input).json());
  counts.total = items.length;
  let checked = 0;
  const resolved = await mapBounded(items,async item=>{
   try {
    // A settled duplicate needs no public fetch: no content or date will change.
    // Uncorrected first-observed dates still go through live verification below.
    const kind = typeof item === 'string' || item?.type === 'Like' ? 'like' : item?.type === 'Announce' ? 'repost' : item?.type === 'Create' ? 'post' : undefined;
    const object = typeof item === 'string' ? item : item?.object;
    const target = typeof object === 'string' ? object : object?.url ?? object?.id;
    if (kind && typeof target === 'string') {
     const key = identity(kind,target,actors);
     const existing = entries.find(e=>indexIdentities([e],actors).has(key));
     if (existing) {
      const actual = typeof item?.published === 'string' && Number.isFinite(Date.parse(item.published));
      const settled = kind === 'post' || !existing.properties['pesos-source']?.length || existing.properties.deleted?.includes('true') ||
       (actual ? Date.parse(String(existing.properties.published?.[0])) === Date.parse(item.published) : ['activity','original-post'].some(source=>existing.properties['pesos-date-source']?.includes(source)));
      if (settled) {counts.duplicates++;return;}
     }
    }

    const activity = await resolveMastodonArchiveItem(item,get);
    if (activity) return activity;
    counts.restrictedOrUnsupported++;
   } catch (error) {unavailable(error);}
   finally {if (++checked % 100 === 0) console.log(JSON.stringify({input:counts.input,checked,total:items.length}));}
  });
  activities = resolved.filter((a):a is Activity=>!!a);
 }
 for (const activity of activities) {
  if (alreadyRepresented(activity,keys,actors)) {
   const existing = entries.find(e=>e.properties['pesos-source']?.length && alreadyRepresented(activity,indexIdentities([e],actors),actors));
   if (existing && activity.kind !== 'post' && !(activity.dateSource === 'original-post' && existing.properties['pesos-date-source']?.includes('activity'))) {
    const generated = await activityDocument(activity,'America/New_York');
    const date = readDocument(generated.content).properties.published[0];
    if (existing.properties.published?.[0] !== date) {
     const original = await Bun.file(resolve(root,existing.path)).text();
     const match = original.match(/^---\r?\n([\s\S]*?)\r?\n---/);
     if (!match) throw new Error('Missing frontmatter on imported entry');
     const metadata = parseDocument(match[1]);
     metadata.set('date',date);metadata.set('pesos-date-source',[activity.dateSource ?? 'activity']);
     if (args.includes('--write')) await Bun.write(resolve(root,existing.path),`---\n${metadata.toString()}---${original.slice(match[0].length)}`);
     existing.properties.published = [date];
     existing.properties['pesos-date-source'] = [activity.dateSource ?? 'activity'];
     counts.updated++;
    }
   }
   counts.duplicates++;continue;
  }
  const generated = await activityDocument(activity,'America/New_York',paths);
  if (args.includes('--write')) await Bun.write(resolve(root,generated.path),generated.content);
  paths.push(generated.path);
  entries.push({path:generated.path,properties:readDocument(generated.content).properties});
  keys.add(`source:${activity.id}`);keys.add(identity(activity.kind,activity.target ?? activity.url,actors));
  counts.imported++;byKind[activity.kind]=(byKind[activity.kind] ?? 0)+1;
 }
 console.log(JSON.stringify({...counts,byKind,unavailableReasons}));
}
