// Public research snapshots only. Run with Bun; no credentials or dependencies.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const sources = [
  ['core', 'indieauth', 'https://indieauth.spec.indieweb.org/'],
  ['core', 'micropub-living', 'https://micropub.spec.indieweb.org/'],
  ['core', 'micropub-recommendation', 'https://www.w3.org/TR/micropub/'],
  ['core', 'micropub-extensions', 'https://indieweb.org/Micropub-extensions'],
  ['core', 'webmention', 'https://www.w3.org/TR/webmention/'],
  ['microformats', 'microformats2', 'https://microformats.org/wiki/microformats2'],
  ['microformats', 'microformats2-parsing', 'https://microformats.org/wiki/microformats2-parsing'],
  ['microformats', 'h-entry', 'https://microformats.org/wiki/h-entry'],
  ['microformats', 'h-card', 'https://microformats.org/wiki/h-card'],
  ['microformats', 'h-feed', 'https://microformats.org/wiki/h-feed'],
  ['microformats', 'h-cite', 'https://microformats.org/wiki/h-cite'],
  ['microformats', 'rel-me', 'https://microformats.org/wiki/rel-me'],
  ['microformats', 'rel-syndication', 'https://microformats.org/wiki/rel-syndication'],
  ['microformats', 'value-class-pattern', 'https://microformats.org/wiki/value-class-pattern'],
  ['microformats', 'post-type-discovery', 'https://www.w3.org/TR/post-type-discovery/'],
  ['supporting', 'jf2', 'https://www.w3.org/TR/jf2/'],
  ['supporting', 'json-feed-1.1', 'https://www.jsonfeed.org/version/1.1/'],
  ['optional', 'websub', 'https://www.w3.org/TR/websub/'],
  ['optional', 'microsub', 'https://indieweb.org/Microsub-spec'],
  ['optional', 'rfc9449-dpop', 'https://www.rfc-editor.org/rfc/rfc9449.txt'],
  ['supporting', 'rss-2.0', 'https://www.rssboard.org/rss-specification'],
  ...[['6749','oauth2'],['6750','bearer-tokens'],['7636','pkce'],['7662','token-introspection'],['7009','token-revocation'],['8414','authorization-server-metadata'],['9700','oauth-security-bcp'],['8288','web-linking'],['4287','atom']].map(([n,name]) => ['supporting', `rfc${n}-${name}`, `https://www.rfc-editor.org/rfc/rfc${n}.txt`]),
];
const repos = [
  'davidwkeith/workers', 'dumaurier/ElevindieWeb',
  'voxpelli/webpage-micropub-to-github', 'getindiekit/indiekit',
  'aaronpk/Quill', 'microformats/microformats-parser', 'microformats/tests',
  'benjifs/serverless-webmentions', 'benjifs/micropub', 'benjifs/github-store',
  'grantcodes/micropub', 'unrelentingtech/micro-panel', 'barryf/micropublish',
  'indieweb/wordpress-micropub', 'rmdes/micropub-mcp',
  'sveltia/sveltia-cms', 'sveltia/sveltia-cms-auth', 'pages-cms/pages-cms', 'decaporg/decap-cms',
];
const manifestFile = Bun.file(join(root, 'manifest.json'));
const previous = await manifestFile.exists() ? (await manifestFile.json()).sources : [];
const manifest = previous.filter(x => x.status === 'downloaded');
const specsOnly = process.argv.includes('--specs-only');
const selectedRepos = process.argv.slice(2).filter(x => !x.startsWith('--'));
async function save(url, path, info = {}) {
  const entry = { ...info, requested_url: url, path, retrieved_at: new Date().toISOString() };
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'IndieWeb-planning-research', Accept: '*/*' }, signal: AbortSignal.timeout(45000) });
    entry.final_url = r.url; entry.http_status = r.status;
    entry.content_type = r.headers.get('content-type');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const body = new TextDecoder().decode(bytes);
    if (/just a moment|verify you are human|checking your browser|Access Denied/i.test(body.slice(0, 5000))) throw new Error('Possible challenge/error page');
    await mkdir(join(root, path, '..'), { recursive: true });
    await Bun.write(join(root, path), bytes);
    entry.bytes = bytes.length;
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
    entry.status = 'downloaded';
    const old = manifest.findIndex(x => x.path === path);
    if (old >= 0) manifest.splice(old, 1);
    manifest.push(entry);
    return body;
  } catch (e) {
    entry.status = 'failed'; entry.error = String(e);
    manifest.push(entry); console.log(`FAILED ${url}: ${e}`);
    return null;
  }
}
async function pool(items, work, n = 4) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await work(items[i++]); }));
}
await pool(selectedRepos.length ? [] : sources.filter(([,id]) => !specsOnly || !manifest.some(x => x.id === id && x.status === 'downloaded')), async ([group, id, url]) => {
  await save(url, `specs/${group}/${id}.${url.endsWith('.txt') ? 'txt' : 'html'}`, { kind: 'specification', group, id });
});
await pool(specsOnly ? [] : selectedRepos.length ? selectedRepos : repos, async (repo) => {
  const dir = `research/repos/${repo.replace('/', '--')}`;
  const body = await save(`https://api.github.com/repos/${repo}`, `${dir}/repository.json`, { kind: 'repository-metadata', repo });
  if (!body) return;
  const meta = JSON.parse(body);
  const branch = meta.default_branch;
  const commitBody = await save(`https://api.github.com/repos/${repo}/commits/${branch}`, `${dir}/commit.json`, { kind: 'repository-commit', repo });
  if (!commitBody) return;
  const sha = JSON.parse(commitBody).sha;
  const treeBody = await save(`https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`, `${dir}/tree.json`, { kind: 'repository-tree', repo, commit: sha });
  if (!treeBody) return;
  const files = JSON.parse(treeBody).tree.filter(x => x.type === 'blob').map(x => x.path);
  const chosen = files.filter(p => /^(readme(?:\.md)?|licen[cs]e(?:\.md|\.txt)?|copying|package\.json|composer\.json)$/i.test(p));
  if (repo === 'davidwkeith/workers') chosen.push(...files.filter(p => /^packages\/(micropub|indieauth|webmention)\/(README\.md|package\.json|src\/.*\.[tj]s|migrations\/.*\.sql)$/.test(p)));
  if (repo === 'dumaurier/ElevindieWeb') chosen.push(...files.filter(p => /^(functions\/.*\.ts|wrangler\.toml)$/.test(p)));
  if (['benjifs/micropub', 'benjifs/github-store'].includes(repo)) chosen.push(...files.filter(p => /^(src\/.*\.[tj]s|lib\/.*\.[tj]s)$/.test(p)));
  if (repo === 'sveltia/sveltia-cms') chosen.push(...files.filter(p => /^(src\/lib\/services\/backends\/git\/github\/(commits|files|deployment|auth)|src\/lib\/services\/contents\/draft\/(backup|save\/(conflict|serialize|index|entry-file))|src\/lib\/services\/contents\/file\/(parse|value-sources|format)|src\/lib\/services\/contents\/fields\/date-time\/timezone)\.js$/.test(p)));
  if (repo === 'sveltia/sveltia-cms-auth') chosen.push(...files.filter(p => /^src\/.*\.js$/.test(p) && !/test/.test(p)));
  await pool([...new Set(chosen)], async p => save(`https://raw.githubusercontent.com/${repo}/${sha}/${p}`, `${dir}/files/${p}${/\.[cm]?[tj]sx?$/.test(p) ? '.txt' : ''}`, { kind: 'repository-file', repo, commit: sha, upstream_path: p }), 3);
});
manifest.sort((a,b) => a.path.localeCompare(b.path));
await Bun.write(join(root, 'manifest.json'), JSON.stringify({ collected_at: new Date().toISOString(), sources: manifest }, null, 2) + '\n');
console.log(JSON.stringify({ downloaded: manifest.filter(x=>x.status==='downloaded').length, failed: manifest.filter(x=>x.status==='failed').map(x=>({url:x.requested_url,error:x.error})) }, null, 2));
