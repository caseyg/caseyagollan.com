import { readFile, appendFile } from 'node:fs/promises';
import { parsePost } from '../src/lib/server/parse-post';
import { getPostPermalink, POST_TYPE_PLURALS } from '../src/lib/posts-types';
import { validPostParams } from '../src/lib/server/github-posts';

const repository = 'caseyg/caseyagollan-content';
const branch = 'main';

/** Notifications select the repository/branch, never an arbitrary revision to deploy. */
export function validateContentDispatch(value: unknown): void {
  const payload = value as Record<string, unknown> | null;
  if (!payload || payload.repository !== repository || payload.branch !== branch ||
      (payload.sha !== undefined && (typeof payload.sha !== 'string' || !/^[a-f0-9]{40}$/.test(payload.sha)))) throw new Error('Invalid content dispatch');
}

export function validateContentSnapshot(files: Record<string, string>): number {
  const urls = new Set<string>();
  let count = 0;
  for (const [path, markdown] of Object.entries(files)) {
    const match = path.match(/^([^/]+)\/(\d{4}-\d{2}-\d{2}-.+)\.md$/);
    if (!match || !Object.values(POST_TYPE_PLURALS).includes(match[1])) continue;
    const post = parsePost(markdown, match[1], `${match[2]}.md`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(post.date) || !Number.isFinite(Date.parse(post.date)) || !validPostParams({ year: post.date.slice(0,4), month: post.date.slice(5,7), day: post.date.slice(8,10), slug: post.slug })) throw new Error(`Invalid post date or slug: ${path}`);
    const url = getPostPermalink(post);
    if (urls.has(url)) throw new Error(`Duplicate permalink: ${url}`);
    urls.add(url); count++;
  }
  return count;
}

async function git(args: string[], cwd = process.cwd()): Promise<string> {
  const result = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(result.stdout).text(), new Response(result.stderr).text(), result.exited]);
  if (code !== 0) throw new Error(`git ${args[0]} failed: ${stderr.trim()}`);
  return stdout.trim();
}

/** Stage before the build: prebuild updates submodules to their index revision. */
export async function selectContentRevision(root: string, revision: string): Promise<void> {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid content revision');
  await git(['checkout', '--detach', revision], `${root}/content`);
  await git(['add', '--', 'content'], root);
}

if (import.meta.main) {
  if (process.env.GITHUB_EVENT_NAME === 'repository_dispatch') {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8'));
    validateContentDispatch(event.client_payload);
  }
  const dryRun = process.argv.includes('--dry-run');
  await git(['submodule', 'update', '--init', '--recursive']);
  const contentDir = `${process.cwd()}/content`;
  const origin = await git(['remote', 'get-url', 'origin'], contentDir);
  if (origin !== `https://github.com/${repository}.git` && origin !== `https://github.com/${repository}`) throw new Error('Unexpected content remote');
  await git(['fetch', 'origin', branch], contentDir);
  const candidate = await git(['rev-parse', 'FETCH_HEAD'], contentDir);
  const current = await git(['rev-parse', 'HEAD'], contentDir);
  // Never move the pin backwards or sideways, even after a force push.
  await git(['merge-base', '--is-ancestor', current, candidate], contentDir);
  const paths = (await git(['ls-tree', '-r', '--name-only', candidate], contentDir)).split('\n').filter(path => path.endsWith('.md'));
  const files: Record<string, string> = {};
  for (const path of paths) files[path] = await git(['show', `${candidate}:${path}`], contentDir);
  const count = validateContentSnapshot(files);
  console.log(`Validated ${count} posts at ${candidate}; content ${current === candidate ? 'unchanged' : 'update available'}`);
  if (!dryRun && current !== candidate) await selectContentRevision(process.cwd(), candidate);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `content_sha=${candidate}\nchanged=${current !== candidate}\n`);
}
