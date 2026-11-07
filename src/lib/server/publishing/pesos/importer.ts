import { readDocument, createDocument, type Properties } from '../document';
import { getPostPermalink, POST_TYPE_PLURALS } from '../../../posts-types';
import { parsePost } from '../../parse-post';
import { publicUrl, safePublicFetch, type PublicFetcher } from '../public-fetch';
import { enrichSocialSnapshots } from '../social-snapshots';
import { socialImageStore } from '../social-media';
import { publishingConfig, type PublishingEnvironment } from '../config';
import { mastodonPage, blueskyPage, type Activity, type GetJson, type Page } from './providers';

export type PesosEnvironment = PublishingEnvironment;
interface IndexEntry { path: string; sha: string; properties: Properties; permalink: string }
interface FeedState { pending: string[]; seen: string[] }
interface State { feeds: Record<string,FeedState> }
class UpstreamError extends Error {
 constructor(readonly status: number) { super(`PESOS upstream status ${status}`); }
}
interface Dependencies { fetcher?: PublicFetcher; now?: () => number; dryRun?: boolean }
const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const strings = (values: unknown) => (Array.isArray(values) ? values : typeof values === 'string' ? [values] : []).filter((v):v is string=>typeof v === 'string');

/** The action forms part of identity: liking and reposting one URL are different actions. */
export function identity(kind: Activity['kind'], value: string, actors: Record<string,string> = {}): string {
 try {
  if (value.startsWith('at://')) value = value.replace(/^at:\/\/([^/]+)\/app.bsky.feed.post\/(.+)$/, 'https://bsky.app/profile/$1/post/$2');
  let url = new URL(value);
  const alias = actors[url.origin + url.pathname.replace(/\/$/,'')];
  if (alias) url = new URL(alias);
  const blue = url.hostname === 'bsky.app' && url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)\/?$/);
  if (blue) return `${kind}:bsky:${actors[blue[1].toLowerCase()] ?? blue[1].toLowerCase()}:${blue[2]}`;
  const mastodon = url.pathname.match(/^\/(?:@[^/]+\/|users\/[^/]+\/statuses\/|web\/statuses\/)(\d+)\/?$/);
  if (mastodon) return `${kind}:mastodon:${url.hostname}:${mastodon[1]}`;
  url.hash = ''; url.search = ''; url.pathname = url.pathname.replace(/\/$/,'');
  return `${kind}:${url.href}`;
 } catch { return `${kind}:${value}`; }
}
export function indexIdentities(entries: Pick<IndexEntry,'properties'>[], actors: Record<string,string> = {}): Set<string> {
 const result = new Set<string>();
 for (const {properties:p} of entries) {
  const kind = p['like-of']?.length ? 'like' : p['repost-of']?.length ? 'repost' : 'post';
  for (const url of strings(p.syndication)) {
   result.add(identity('post',url,actors));
   result.add(identity(kind,url,actors));
  }
  for (const url of strings(p['pesos-source'])) result.add(`source:${url}`);
  for (const url of strings(p['like-of'])) result.add(identity('like',url,actors));
  for (const url of strings(p['repost-of'])) result.add(identity('repost',url,actors));
 }
 return result;
}
export function alreadyRepresented(activity: Activity, keys: Set<string>, actors: Record<string,string> = {}): boolean {
 return keys.has(`source:${activity.id}`) || keys.has(identity(activity.kind,activity.target ?? activity.url,actors)) || keys.has(identity(activity.kind,activity.url,actors));
}
function localTimestamp(value: string, timeZone: string): string {
 const parts = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(new Date(value));
 const get = (key: string) => parts.find(p=>p.type === key)?.value ?? '';
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${get('timeZoneName').replace('GMT','') || '+00:00'}`;
}
export async function activityDocument(activity: Activity, timeZone: string, occupied: Iterable<string> = []): Promise<{path:string;content:string}> {
 const date = localTimestamp(activity.published,timeZone);
 const folder = activity.kind === 'like' ? 'likes' : activity.kind === 'repost' ? 'reposts' : activity.properties['in-reply-to'] ? 'replies' : activity.properties.photo ? 'photos' : activity.properties.video ? 'videos' : 'notes';
 const properties: Properties = {...activity.properties,published:[date],'pesos-source':[activity.id]};
 if (activity.kind === 'post' || (activity.kind === 'repost' && activity.url !== activity.target)) properties.syndication = [activity.url];
 if (activity.service === 'mastodon' && activity.kind === 'like') properties['pesos-date-source'] = ['first-observed'];
 if (activity.target) properties[activity.kind === 'like' ? 'like-of' : 'repost-of'] = [activity.target];
 // Deliberately omit mp-syndicate-to: imports must never be syndicated back out.
 const target = new URL(activity.target ?? activity.url);
 const id = target.pathname.replace(/\/$/,'').split('/').pop() ?? '';
 if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid social post ID');
 // Permalinks omit folders, so detect collisions across every post type.
 const used = new Set([...occupied].map(path=>path.split('/').pop()));
 let slug = id;
 const prefix = date.slice(0,10);
 if (used.has(`${prefix}-${slug}.md`)) slug = `${id}-${activity.kind}`;
 if (used.has(`${prefix}-${slug}.md`)) slug = `${id}-${activity.kind}-${target.hostname.replace(/[^a-zA-Z0-9-]/g,'-')}`;
 const base = slug;
 for(let n=2;used.has(`${prefix}-${slug}.md`);n++) slug = `${base}-${n}`;
 return {path:`${folder}/${date.slice(0,10)}-${slug}.md`,content:createDocument(properties)};
}

export async function processPesos(env: PesosEnvironment, dependencies: Dependencies = {}) {
 const result = {imported:0,skipped:0,feeds:0,failedFeeds:0,dryRun:!!dependencies.dryRun};
 if (env.PESOS_ENABLED !== 'true') return result;
 const config = publishingConfig(env);
 if (!config?.state) throw new Error('PESOS requires publishing configuration and state');
 const bucket = config.state;
 const now = dependencies.now ?? Date.now;
 const fetcher = dependencies.fetcher ?? safePublicFetch;
 const deadline = AbortSignal.timeout(7 * 60_000);
 const request: GetJson = async (url,headers = {}) => {
  publicUrl(url);
  const response = await fetcher(url,{headers:{Accept:'application/json',...headers},cache:'no-store',redirect:'error',signal:AbortSignal.any([deadline,AbortSignal.timeout(15_000)])});
  if (!response.ok) throw new UpstreamError(response.status);
  return {data:await response.json(),link:response.headers.get('link') ?? undefined};
 };
 const leaseKey = 'private/pesos/lease.json';
 const previous = await bucket.get(leaseKey);
 if (previous && (await previous.json<{until:number}>()).until > now()) return result;
 const lease = await bucket.put(leaseKey,JSON.stringify({until:now()+8*60_000}),{onlyIf:previous ? {etagMatches:previous.etag} : {etagDoesNotMatch:'*'}});
 if (!lease) return result;
 try {
  const githubHeaders = {Authorization:`Bearer ${config.token}`,'User-Agent':'caseyagollan-pesos','X-GitHub-Api-Version':'2022-11-28'};
  const repo = `https://api.github.com/repos/${config.owner}/${config.repo}`;
  const head = (await request(`${repo}/git/ref/heads/${encodeURIComponent(config.branch)}`,githubHeaders)).data.object.sha as string;
  const tree = (await request(`${repo}/git/trees/${head}?recursive=1`,githubHeaders)).data;
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Incomplete content tree');
  const folders = new Set(Object.values(POST_TYPE_PLURALS));
  const files = tree.tree.filter((f:any)=>f.type === 'blob' && folders.has(f.path.split('/')[0]) && /^[^/]+\/[^/]+\.md$/.test(f.path));
  if (files.length > 5000) throw new Error('Content index exceeds safety limit');
  const entries: IndexEntry[] = [];
  for (const file of files) {
   const key = `private/pesos/index/${file.sha}.json`;
   const cached = await bucket.get(key);
   let entry: IndexEntry;
   if (cached) {
    const cachedEntry = await cached.json<IndexEntry>();
    entry = {...cachedEntry,path:file.path,sha:file.sha};
    const name = file.path.split('/')[1];
    entry.permalink = new URL(getPostPermalink({date:strings(entry.properties.published)[0] ?? '',slug:name.replace(/\.md$/,'').replace(/^\d{4}-\d{2}-\d{2}-/,'')}),config.me).href;
    // Blob hashes survive renames; refresh cached locations from the current tree.
    if(cachedEntry.path !== entry.path || cachedEntry.permalink !== entry.permalink) await bucket.put(key,JSON.stringify(entry));
   }
   else {
    const blob = (await request(`${repo}/git/blobs/${file.sha}`,githubHeaders)).data;
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > 1024*1024) throw new Error('Invalid content blob');
    const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
    const content = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const [folder,name] = file.path.split('/');
    const post = parsePost(content,folder,name);
    entry = {path:file.path,sha:file.sha,properties:readDocument(content).properties,permalink:new URL(getPostPermalink(post),config.me).href};
    await bucket.put(key,JSON.stringify(entry));
   }
   entries.push(entry);
  }
  const actors: Record<string,string> = {};
  const handles = new Set<string>();
  for (const entry of entries) for (const values of Object.values(entry.properties)) for (const url of strings(values)) {
   const handle = url.match(/^https:\/\/bsky.app\/profile\/([^/]+)\/post\//)?.[1];
   if (handle && !handle.startsWith('did:')) handles.add(handle.toLowerCase());
  }
  const blue = env.PUBLISHING_BLUESKY_IDENTIFIER?.trim() ? {identifier:env.PUBLISHING_BLUESKY_IDENTIFIER,service:env.PUBLISHING_BLUESKY_SERVICE ?? 'https://bsky.social'} : undefined;
  if (blue) handles.add(blue.identifier.toLowerCase());
  for (const handle of handles) {
   if (handle.startsWith('did:')) { actors[handle] = handle; continue; }
   const {data} = await request(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
   if (typeof data.did !== 'string') throw new Error('Unable to resolve Bluesky identity');
   actors[handle] = data.did;
  }
  // Mastodon local URLs for federated posts carry a different status ID from
  // the author's canonical URL. Resolve those aliases before comparing likes/reposts.
  for (const entry of entries) for (const url of [...strings(entry.properties['like-of']),...strings(entry.properties['repost-of']),...strings(entry.properties.syndication)]) {
   let parsed: URL;
   try { parsed = publicUrl(url); } catch { continue; }
   const match = parsed.pathname.match(/^\/(?:@[^/]+\/|users\/[^/]+\/statuses\/|web\/statuses\/)(\d+)\/?$/);
   if (!match) continue;
   const alias = parsed.origin + parsed.pathname.replace(/\/$/,'');
   const key = `private/pesos/aliases/${await digest(alias)}.json`;
   const cached = await bucket.get(key);
   if (cached) { actors[alias] = (await cached.json<{url:string}>()).url; continue; }
   try {
    const {data} = await request(`${parsed.origin}/api/v1/statuses/${match[1]}`);
    const canonical = publicUrl(data.url).href;
    actors[alias] = canonical;
    await bucket.put(key,JSON.stringify({url:canonical}));
   } catch (error) {
    // A deleted original cannot appear in a current activity feed. Other errors
    // must retry rather than assume two different URLs represent different posts.
    if (!(error instanceof UpstreamError) || ![404,410].includes(error.status)) throw error;
   }
  }
  const keys = indexIdentities(entries,actors);
  // An outbound send can succeed before its Git bookkeeping lands. Never import in that gap.
  for (const entry of entries) for (const service of ['mastodon','bluesky'] as const) {
   const receipt = await bucket.get(`private/syndication/${await digest(`${entry.permalink}\0${service}`)}.json`);
   if (!receipt) continue;
   const data = await receipt.json<{status:string;url?:string}>();
   if (data.status === 'sending') throw new Error('Syndication outcome pending reconciliation');
   if (data.url) {
    const kind = entry.properties['like-of']?.length ? 'like' : entry.properties['repost-of']?.length ? 'repost' : 'post';
    keys.add(identity('post',data.url,actors));
    keys.add(identity(kind,data.url,actors));
   }
  }
  const stored = await bucket.get('private/pesos/state.json');
  const state: State = stored ? await stored.json<State>() : {feeds:{}};
  const feeds: {name:string;page:(cursor?:string)=>Promise<Page>}[] = [];
  const mastodon = config.syndication?.mastodon;
  if (mastodon) {
   try {
   const base = publicUrl(mastodon.instance).origin;
   const account = (await request(`${base}/api/v1/accounts/verify_credentials`,{Authorization:`Bearer ${mastodon.token}`})).data;
   if (typeof account.id !== 'string') throw new Error('Invalid Mastodon identity');
   for (const kind of ['post','like'] as const) feeds.push({name:`mastodon:${kind}`,page:cursor=>mastodonPage(request,base,mastodon.token,account.id,kind,cursor,new Date(now()).toISOString())});
   } catch {
    result.failedFeeds++;
    console.warn(JSON.stringify({event:'pesos_provider_failed',feed:'mastodon:identity'}));
   }
  }
  if (blue) for (const kind of ['post','like','repost'] as const) feeds.push({name:`bluesky:${kind}`,page:cursor=>blueskyPage(request,publicUrl(blue.service).origin,actors[blue.identifier.toLowerCase()],kind,cursor)});
  if (!feeds.length) throw new Error('No PESOS providers configured');
  const additions: {path:string;content:string}[] = [];
  for (const feed of feeds) {
   try {
   let full = false;
   let feedImports = 0;
   const checkpoint = state.feeds[feed.name] ?? {pending:[],seen:[]};
   const seen = new Set(checkpoint.seen);
   const pending = [...checkpoint.pending];
   // Check the newest page every run, while draining durable older page cursors.
   const cursors: (string|undefined)[] = [undefined,...(pending.length ? [pending.shift()!] : [])];
   for (const cursor of cursors) {
    const page = await feed.page(cursor);
    const fresh = page.ids.some(id=>!seen.has(id));
    for (const activity of page.activities) {
     if (seen.has(activity.id)) continue;
     if (alreadyRepresented(activity,keys,actors)) { result.skipped++; seen.add(activity.id); continue; }
     // Give every feed capacity during a large historical backfill.
     if (feedImports >= 2 || additions.length >= 12) { full = true; break; }
     let file = await activityDocument(activity,config.timeZone,[...entries,...additions].map(file=>file.path));
     if (activity.kind !== 'post') file.content = await enrichSocialSnapshots(file.content,fetcher,{storeImage:dependencies.dryRun ? undefined : socialImageStore(config.mediaBucket,config.me,config.mediaBaseUrl),timeoutMs:10_000});
     additions.push(file);
     feedImports++;
     keys.add(`source:${activity.id}`);
     keys.add(identity(activity.kind,activity.target ?? activity.url,actors));
     seen.add(activity.id);
    }
    if (full) break;
    for (const id of page.ids) seen.add(id);
    if (page.cursor && fresh && page.cursor !== cursor && !pending.includes(page.cursor)) pending.push(page.cursor);
   }
   // If a page was only partly imported, retry it next time; Git identities make this safe.
   if (full) continue;
   state.feeds[feed.name] = {pending,seen:[...seen]};
   result.feeds++;
   } catch {
    result.failedFeeds++;
    console.warn(JSON.stringify({event:'pesos_provider_failed',feed:feed.name}));
   }
  }
  if (additions.length && !dependencies.dryRun) {
   // Compare-and-swap against the exact Git revision used for deduplication.
   // A concurrent site post forces the entire scan to retry with a fresh index.
   const response = await fetcher('https://api.github.com/graphql',{method:'POST',headers:{...githubHeaders,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.any([deadline,AbortSignal.timeout(15_000)]),body:JSON.stringify({query:'mutation Import($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }',variables:{input:{branch:{repositoryNameWithOwner:`${config.owner}/${config.repo}`,branchName:config.branch},expectedHeadOid:head,message:{headline:`Import ${additions.length} social activities (PESOS)`},fileChanges:{additions:additions.map(file=>({path:file.path,contents:btoa(Array.from(new TextEncoder().encode(file.content),b=>String.fromCharCode(b)).join(''))}))}}}})});
   if (!response.ok) throw new Error('PESOS commit unavailable');
   const data = await response.json() as {errors?:unknown[];data?:{createCommitOnBranch?:{commit?:{oid?:string}}}};
   if (data.errors?.length || !data.data?.createCommitOnBranch?.commit?.oid) throw new Error('PESOS commit conflicted or outcome unknown');
  }
  if (!dependencies.dryRun) {
   const saved = await bucket.put('private/pesos/state.json',JSON.stringify(state),{onlyIf:stored ? {etagMatches:stored.etag} : {etagDoesNotMatch:'*'}});
   if (!saved) throw new Error('PESOS checkpoint raced');
  }
  result.imported = additions.length;
  return result;
 } finally {
  // Keep the lease object and conditionally expire it; never delete a successor's lease.
  await bucket.put(leaseKey,JSON.stringify({until:0}),{onlyIf:{etagMatches:lease.etag}});
 }
}
