import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readDocument } from '../src/lib/server/publishing/document';
import { activityDocument } from '../src/lib/server/publishing/pesos/importer';
import type { Activity } from '../src/lib/server/publishing/pesos/providers';

// Rename only imported files; preserve source identity, timestamps and saved snapshots.
const args = process.argv.slice(2);
if(args.some(arg=>arg !== '--write')) throw new Error('Usage: bun utils/rename-social-imports.ts [--write]');
const root = resolve('content');
const paths = (await Array.fromAsync(new Bun.Glob('*/*.md').scan({cwd:root}))).sort();
const occupied = new Set(paths);
let changed = 0;
for(const path of paths) {
 if(!/\/\d{4}-\d{2}-\d{2}-pesos-[a-f0-9]{24}\.md$/.test(path)) continue;
 const {properties:p} = readDocument(await Bun.file(resolve(root,path)).text());
 const source = p['pesos-source']?.[0];
 const kind = p['like-of']?.length ? 'like' : p['repost-of']?.length ? 'repost' : 'post';
 const url = (p['like-of'] ?? p['repost-of'] ?? p.syndication)?.[0];
 const published = p.published?.[0];
 if(typeof source !== 'string' || typeof url !== 'string' || typeof published !== 'string') throw new Error(`Missing source metadata: ${path}`);
 const activity: Activity = {id:source,service:source.startsWith('at://') ? 'bluesky' : 'mastodon',kind,url,...(kind === 'post' ? {} : {target:url}),published,properties:p};
 const generated = await activityDocument(activity,'America/New_York',occupied);
 // Keep the original folder and filename date; only replace the slug.
 const slug = generated.path.split('/')[1].slice(11);
 const destination = path.replace(/pesos-[a-f0-9]{24}\.md$/,slug);
 if(occupied.has(destination)) throw new Error(`Destination exists: ${destination}`);
 occupied.add(destination);
 if(args.includes('--write')) await rename(resolve(root,path),resolve(root,destination));
 console.log(`${path} -> ${destination}`);
 changed++;
}
console.log(`${changed} imports ${args.includes('--write') ? 'renamed' : 'would be renamed; add --write to apply'}. Source IDs and import checkpoints remain valid.`);
