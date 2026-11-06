import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const { sources } = await Bun.file(join(root, 'manifest.json')).json();
const paths = new Set();
for (const s of sources) {
  if (s.status !== 'downloaded') throw new Error(`Unresolved retrieval: ${s.requested_url}`);
  if (paths.has(s.path)) throw new Error(`Duplicate path: ${s.path}`);
  paths.add(s.path);
  const bytes = new Uint8Array(await Bun.file(join(root, s.path)).arrayBuffer());
  if (bytes.length !== s.bytes) throw new Error(`Byte count mismatch: ${s.path}`);
  if (createHash('sha256').update(bytes).digest('hex') !== s.sha256) throw new Error(`Hash mismatch: ${s.path}`);
  if (s.kind === 'repository-file' && /\.[cm]?[tj]sx?$/.test(s.path)) throw new Error(`Executable upstream source: ${s.path}`);
  if (s.kind === 'specification' && s.path.endsWith('.html')) {
    const body = new TextDecoder().decode(bytes);
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (!title || /just a moment|not found|access denied|error|captcha/i.test(title)) throw new Error(`Bad page title: ${s.path}: ${title}`);
    console.log(`${s.id}: ${title.replace(/\s+/g, ' ').trim()}`);
  }
}
const specs = sources.filter(x => x.kind === 'specification').length;
const repos = sources.filter(x => x.kind === 'repository-metadata').length;
console.log(`Verified ${sources.length} files by size and SHA-256; ${specs} specification originals; ${repos} repositories.`);
