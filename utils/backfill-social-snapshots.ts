import { resolve, relative, isAbsolute } from 'node:path';
import { realpath } from 'node:fs/promises';
import { archivePhotoProperties, socialImageKey, type SocialImageStore } from '../src/lib/server/publishing/social-media';
import { parseDocument } from 'yaml';
import { blueskyPublic, mastodonActivity } from '../src/lib/server/publishing/pesos/providers';
import { backfillNetwork } from './lib/backfill-network';
import { enrichSocialSnapshots, formatSnapshotScalars } from '../src/lib/server/publishing/social-snapshots';

const raw = process.argv.slice(2);
let platform='all',concurrency=8,limit=Infinity,resumeAfter=0;
const ownImages=raw.includes('--own-images');
const args:string[]=[];
for(let i=0;i<raw.length;i++) {
 if(raw[i]==='--platform') platform=raw[++i];
 else if(raw[i]==='--concurrency') concurrency=Number(raw[++i]);
 else if(raw[i]==='--resume-after') resumeAfter=Date.parse(raw[++i]);
 else if(raw[i]==='--limit') limit=Number(raw[++i]);
 else if(raw[i]!=='--own-images') args.push(raw[i]);
}
if(!['all','bluesky','mastodon'].includes(platform)||!Number.isInteger(concurrency)||concurrency<1||concurrency>8||!(limit>0)) throw new Error('Use --platform all|bluesky|mastodon, --concurrency 1..8 and --limit N');
const network=backfillNetwork();
const uploads=new Map<string,Promise<string>>();
let uploaded=0,reused=0,uploadFailures=0;

if (args.some(arg => arg.startsWith('--') && !['--write','--refresh','--remote-media','--help'].includes(arg))) throw new Error('Unknown option');
if (args.includes('--help')) {
 console.log('bun run backfill-social-snapshots [content/likes/post.md ...] [--write --remote-media] [--refresh]\nDefaults to missing likes/reposts, replies and authored quotations; --platform all|bluesky|mastodon --concurrency 1..8 --limit N --resume-after ISO_TIMESTAMP. Use --own-images for original photos. Dry run unless --write is supplied. Use --refresh to re-fetch existing snapshots. Commit changed Markdown in the content repository.');
 process.exit(0);
}
if(args.includes('--write') && !args.includes('--remote-media')) throw new Error('--write requires --remote-media to save associated images to R2');
const { unstable_readConfig } = await import('wrangler');
const config = unstable_readConfig({config:resolve('wrangler.jsonc')});
const mastodonInstance = config.vars.PUBLISHING_MASTODON_INSTANCE as string | undefined;
let storeImage: SocialImageStore | undefined;
if(args.includes('--write')) {
 const bucket = config.r2_buckets.find(binding=>binding.binding === 'PUBLISHING_MEDIA')?.bucket_name;
 const base = config.vars.PUBLISHING_MEDIA_BASE_URL;
 if(!bucket || typeof base !== 'string') throw new Error('Configure PUBLISHING_MEDIA and PUBLISHING_MEDIA_BASE_URL in Wrangler');
 const origin = new URL(base);
 if(origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid media base URL');
 storeImage = async(bytes,type)=> {
  const key = await socialImageKey(bytes,type);
  if(!uploads.has(key)) uploads.set(key,(async()=>{
   const url = new URL(`publishing/${key}`,origin).href;
   const exists=await network.fetcher(url,{method:'HEAD'});
   if(exists.ok){reused++;return url;}
   const account=Bun.env.CLOUDFLARE_ACCOUNT_ID,token=Bun.env.CLOUDFLARE_API_TOKEN;
   if(!account||!token||!/^[a-f0-9]{32}$/.test(account))throw new Error('Configure the existing Cloudflare account and R2-write token');
   const response=await network.fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/publishing/${key}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':type,'Cache-Control':'public, max-age=31536000, immutable'},body:new Uint8Array(bytes)});
   if(!response.ok){uploadFailures++;console.error('Image upload failed',key,response.status);throw new Error('R2 upload failed');}
   uploaded++;return url;
  })());
  return uploads.get(key)!;
 };
}
const root = await realpath(resolve('content'));
let paths = args.filter(arg=>!arg.startsWith('--'));
if(!paths.length) paths = await Array.fromAsync(new Bun.Glob('*/*.md').scan({cwd:root,absolute:true}));
const candidates: {full:string;before:string;host:string}[]=[];
for(const path of paths) {
 const full=await realpath(resolve(path));const inside=relative(root,full);
 if(inside.startsWith('..')||isAbsolute(inside)||!/^[^/]+\/[^/]+\.md$/.test(inside))throw new Error('Use Markdown files in a canonical content folder');
 const before=await Bun.file(full).text();const match=before.match(/^---\r?\n([\s\S]*?)\r?\n---/);if(!match)continue;
 const data=parseDocument(match[1]).toJS();if(data.deleted||data._micropubSocialSnapshots?.length&&!args.includes('--refresh'))continue;
 if(resumeAfter&&data._micropubSocialSnapshots?.length&&data._micropubSocialSnapshots.every((snapshot:any)=>Date.parse(snapshot.fetchedAt)>=resumeAfter))continue;
 const targets=ownImages?(data.syndication?.[0]):(data['like-of']??data['repost-of']??data['in-reply-to']??data.inReplyTo??data['quotation-of']);const target=typeof targets==='string'?targets:targets?.[0];if(typeof target!=='string')continue;
 if(ownImages&&(!data.photo?.length||!data['pesos-source']?.some((s:any)=>/^mastodon:post:/.test(String(s))||/^at:\/\/[^/]+\/app.bsky.feed.post\//.test(String(s)))))continue;
 const blue=new URL(target).hostname==='bsky.app';if(platform!=='all'&&platform!==(blue?'bluesky':'mastodon'))continue;
 const localSource=typeof data['pesos-source']?.[0]==='string'&&/^mastodon:(?:like|repost):\d+$/.test(data['pesos-source'][0]);
 candidates.push({full,before,host:localSource&&mastodonInstance?new URL(mastodonInstance).hostname:new URL(target).hostname});
}
// Round-robin hosts so a slow or throttled instance cannot occupy every worker.
const groups=new Map<string,typeof candidates>();for(const item of candidates){if(!groups.has(item.host))groups.set(item.host,[]);groups.get(item.host)!.push(item);}
const ordered:typeof candidates=[];while([...groups.values()].some(g=>g.length))for(const group of groups.values()){const item=group.shift();if(item)ordered.push(item);}
const work=ordered.slice(0,limit);let next=0,changed=0,unavailable=0,done=0;
await Promise.all(Array.from({length:concurrency},async()=>{
 while(next<work.length){const {full,before}=work[next++];
  let after:string;
  if(ownImages){
   const match=before.match(/^---\r?\n([\s\S]*?)\r?\n---/)!;const doc=parseDocument(match[1]);const data=doc.toJS();const source=data['pesos-source'][0];
   const get=async(url:string)=>{const r=await network.fetcher(url,{headers:{accept:'application/json'}});if(!r.ok)throw Object.assign(new Error('Public lookup failed'),{status:r.status});return {data:await r.json()};};
   let allowed=false;try{if(source.startsWith('at://'))allowed=await blueskyPublic(get,source);else{const {data:s}=await get(`${mastodonInstance}/api/v1/statuses/${source.split(':').pop()}`);allowed=!!mastodonActivity(s,'post','')&&s.account?.locked===false&&data.syndication.includes(s.url);}}catch{}
   if(!allowed){unavailable++;done++;continue;}
   const p=await archivePhotoProperties({photo:data.photo},storeImage,network.fetcher);
   if(JSON.stringify(p.photo)===JSON.stringify(data.photo)){unavailable++;done++;continue;}
   doc.set('photo',p.photo);formatSnapshotScalars(doc.get('photo',true));after=`---\n${doc.toString({lineWidth:0,doubleQuotedAsJSON:true})}---${before.slice(match[0].length)}`;
  }else after=await enrichSocialSnapshots(before,network.fetcher,{refresh:args.includes('--refresh'),storeImage,mastodonInstance,timeoutMs:180_000});
  if(after!==before){if(args.includes('--write'))await Bun.write(full,after);changed++;}else unavailable++;
  if(++done%25===0)console.log(JSON.stringify({done,total:work.length,changed,unavailable,uploaded,reused,...network.stats}));
 }
}));
console.log(JSON.stringify({mode:args.includes('--write')?'write':'dry-run',total:work.length,changed,unavailable,uploaded,reused,uploadFailures,...network.stats}));
if(uploadFailures)process.exitCode=1;
