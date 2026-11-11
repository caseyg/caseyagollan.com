/** Upgrade saved Bluesky previews without replacing their text, media or timestamps. */
import { parseDocument } from 'yaml';
import { enrichSocialSnapshots } from '../src/lib/server/publishing/social-snapshots';

const write = process.argv.includes('--write');
const paths = process.argv.slice(2).filter(arg => arg !== '--write');
const files = paths.length ? paths : await Array.fromAsync(new Bun.Glob('{likes,reposts,replies}/*.md').scan({cwd:'content',absolute:true}));
let changed = 0;
let next = 0;
await Promise.all(Array.from({length:4},async()=>{
while (next < files.length) {
 const path = files[next++];
 const before = await Bun.file(path).text();
 const front = before.match(/^---\r?\n([\s\S]*?)\r?\n---/);
 if (!front) continue;
 const data = parseDocument(front[1]).toJS();
 if (data.deleted || !data._micropubSocialSnapshots?.some((s:any) => s.platform === 'bluesky' && !s.thread)) continue;
 const after = await enrichSocialSnapshots(before,undefined,{threadMetadataOnly:true,timeoutMs:20_000});
 if (after !== before) { if (write) await Bun.write(path,after); changed++; console.log(path); }
}
}));
console.log(`${write ? 'Updated' : 'Would update'} ${changed} files`);
