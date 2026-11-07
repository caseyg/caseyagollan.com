import { resolve, relative, isAbsolute } from 'node:path';
import { realpath, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { socialImageKey, type SocialImageStore } from '../src/lib/server/publishing/social-media';
import { enrichSocialSnapshots } from '../src/lib/server/publishing/social-snapshots';

const args = process.argv.slice(2);
if (args.some(arg => arg.startsWith('--') && !['--write','--refresh','--remote-media','--help'].includes(arg))) throw new Error('Unknown option');
if (args.includes('--help')) {
 console.log('bun run backfill-social-snapshots [content/likes/post.md ...] [--write --remote-media] [--refresh]\nDefaults to all likes/reposts. Dry run unless --write is supplied. Use --refresh to re-fetch existing snapshots. Commit changed Markdown in the content repository.');
 process.exit(0);
}
if(args.includes('--write') && !args.includes('--remote-media')) throw new Error('--write requires --remote-media to save associated images to R2');
let storeImage: SocialImageStore | undefined;
if(args.includes('--write')) {
 const { unstable_readConfig } = await import('wrangler');
 const config = unstable_readConfig({config:resolve('wrangler.jsonc')});
 const bucket = config.r2_buckets.find(binding=>binding.binding === 'PUBLISHING_MEDIA')?.bucket_name;
 const base = config.vars.PUBLISHING_MEDIA_BASE_URL;
 if(!bucket || typeof base !== 'string') throw new Error('Configure PUBLISHING_MEDIA and PUBLISHING_MEDIA_BASE_URL in Wrangler');
 const origin = new URL(base);
 if(origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid media base URL');
 storeImage = async(bytes,type)=> {
  const key = await socialImageKey(bytes,type);
  const directory = await mkdtemp(resolve(tmpdir(),'social-image-'));
  try {
   const file = resolve(directory,'image');
   await Bun.write(file,bytes);
   const command = Bun.spawn(['bun','run','wrangler','r2','object','put',`${bucket}/publishing/${key}`,'--remote','--file',file,'--content-type',type,'--cache-control','public, max-age=31536000, immutable'],{stdout:'pipe',stderr:'pipe'});
   const [,,exitCode] = await Promise.all([new Response(command.stdout).text(),new Response(command.stderr).text(),command.exited]);
   if(exitCode !== 0) throw new Error('R2 upload failed');
   return new URL(`publishing/${key}`,origin).href;
  } finally { await rm(directory,{recursive:true,force:true}); }
 };
}
const root = await realpath(resolve('content'));
let paths = args.filter(arg=>!arg.startsWith('--'));
if(!paths.length) paths = await Array.fromAsync(new Bun.Glob('{likes,reposts}/*.md').scan({cwd:root,absolute:true}));
let changed = 0;
for(const path of paths) {
 const full = await realpath(resolve(path));
 const inside = relative(root,full);
 if(inside.startsWith('..') || isAbsolute(inside) || !/^(likes|reposts)\/[^/]+\.md$/.test(inside)) throw new Error('Use Markdown files in content/likes or content/reposts');
 const before = await Bun.file(full).text();
 const after = await enrichSocialSnapshots(before, undefined, {refresh:args.includes('--refresh'),storeImage,timeoutMs:30_000});
 if(after === before) { console.log(`Unchanged: ${inside} (already saved, unsupported, or unavailable)`); continue; }
 changed++;
 if(args.includes('--write')) await Bun.write(full,after);
 console.log(`${args.includes('--write') ? 'Saved' : 'Would save'}: ${inside}`);
}
console.log(`${changed} changed; ${args.includes('--write') ? 'commit content changes to GitHub to publish' : 'dry run; add --write --remote-media to save'}.`);
