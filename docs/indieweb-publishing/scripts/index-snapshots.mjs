import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const file = Bun.file(join(root, 'manifest.json'));
const manifest = await file.json();
manifest.sources = manifest.sources.filter(x => x.kind !== 'derived-text');
const specs = manifest.sources.filter(x => x.kind === 'specification' && x.status === 'downloaded');
for (const entry of specs) {
  if (!entry.path.endsWith('.html')) continue;
  const raw = await Bun.file(join(root, entry.path)).text();
  const cleaned = await new HTMLRewriter()
    .on('script,style,nav,header,footer', { element(e) { e.remove(); } })
    .on('h1,h2,h3,h4,p,li,pre,div,section,br,tr', { element(e) { e.before('\n'); e.after('\n'); } })
    .transform(new Response(raw)).text();
  const chunks = [];
  await new HTMLRewriter().on('body', { text(t) { chunks.push(t.text); } })
    .transform(new Response(cleaned)).text();
  const content = chunks.join('').replace(/\r/g, '').split('\n').map(x => x.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  if (content.length < 1000) throw new Error(`Suspiciously short text: ${entry.path}`);
  const path = entry.path.replace(/\.html$/, '.txt');
  await Bun.write(join(root, path), content);
  manifest.sources.push({ kind: 'derived-text', path, derived_from: entry.path, source_sha256: entry.sha256, sha256: createHash('sha256').update(content).digest('hex'), bytes: Buffer.byteLength(content), status: 'downloaded' });
}
manifest.sources.sort((a,b) => a.path.localeCompare(b.path));
await Bun.write(file, JSON.stringify(manifest, null, 2) + '\n');
const lines = ['# Specification snapshots', '', 'Retrieved for the publishing architecture research on 2026-11-06. HTML files preserve upstream responses; text companions are searchable extracts, not normative replacements. Stylesheets and linked subpages are not bundled. Original licenses and attribution remain in each source.', '', 'Core = publishing/auth/interaction. Microformats = HTML vocabulary and parsing. Supporting = referenced standards and feed formats. Optional = features outside the initial publishing scope. These groups describe plan scope, not standards maturity.', '', 'The Micropub extensions page includes stable extensions, proposals, and brainstorming. JF2 and Post Type Discovery are W3C Notes; neither should be described as a W3C Recommendation. Microformats and IndieAuth are living specifications. RFCs are fixed documents; OAuth RFC 9700 updates security guidance for the older OAuth RFCs.', '', '| Group | Reference | Local original | Text | Upstream |', '|---|---|---|---|---|'];
for (const e of specs.sort((a,b) => a.path.localeCompare(b.path))) {
  const original = e.path.replace('specs/', '');
  lines.push(`| ${e.group} | ${e.id} | [snapshot](${original}) | [text](${original.replace(/\.html$/, '.txt')}) | [source](${e.requested_url}) |`);
}
await Bun.write(join(root, 'specs/README.md'), lines.join('\n') + '\n');
const rows = ['# Repository snapshot inventory', '', 'Default-branch commits inspected on 2026-11-06. `pushed_at` is not the date of the default-branch commit and may reflect other refs. License below is GitHub detection; check the captured license and package declaration before reuse. Missing detection does not mean permission to copy.', '', '| Repository | Default commit | Commit date | GitHub license detection | Archived |', '|---|---|---|---|---|'];
for (const e of manifest.sources.filter(x => x.kind === 'repository-metadata' && x.status === 'downloaded')) {
  const r = await Bun.file(join(root, e.path)).json();
  const dir = e.path.replace('/repository.json', '');
  const c = await Bun.file(join(root, dir, 'commit.json')).json();
  rows.push(`| [${r.full_name}](${r.html_url}) | [${c.sha.slice(0,12)}](${r.html_url}/commit/${c.sha}) | ${c.commit.committer.date} | ${r.license?.spdx_id ?? 'not detected'} | ${r.archived} |`);
}
await Bun.write(join(root, 'research/INVENTORY.md'), rows.join('\n') + '\n');
console.log(`Indexed ${specs.length} original specifications and ${rows.length - 6} repositories.`);
