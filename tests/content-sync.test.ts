import { expect, test } from 'bun:test';
import { validateContentSnapshot, validateContentDispatch } from '../utils/sync-content';
const note = (date = '2026-11-06T12:00:00-05:00', flags = '') => `---\ndate: ${date}\n${flags}---\nHello`;
test('validates the canonical content snapshot without losing local dates or publication flags', () => {
  expect(validateContentSnapshot({ 'notes/2026-11-06-test.md': note(), 'articles/2026-11-07-legacy.md': note('2026-11-06T23:30:00-05:00'), 'notes/2026-11-06-hidden.md': note(undefined, 'deleted: true\n') })).toBe(3);
  expect(() => validateContentSnapshot({ 'notes/2026-11-06-test.md': note('2026-02-30T12:00:00Z') })).toThrow();
  expect(() => validateContentSnapshot({ 'notes/2026-11-06-test.md': note(), 'articles/2026-11-06-test.md': note() })).toThrow('Duplicate');
  expect(() => validateContentSnapshot({ 'notes/2026-11-06-test.md': '---\ndate: [bad]\n---\nBody' })).toThrow();
});
test('accepts only main-branch dispatches from the canonical content repository', () => {
  expect(() => validateContentDispatch({ repository: 'caseyg/caseyagollan-content', branch: 'main', sha: 'a'.repeat(40) })).not.toThrow();
  for (const payload of [{}, { repository: 'other/repo', branch: 'main' }, { repository: 'caseyg/caseyagollan-content', branch: 'preview/indieweb' }, { repository: 'caseyg/caseyagollan-content', branch: 'main', sha: '$(bad)' }]) expect(() => validateContentDispatch(payload)).toThrow();
});

test('the selected content revision survives the existing prebuild submodule update', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { selectContentRevision } = await import('../utils/sync-content');
  const root = await mkdtemp(join(tmpdir(), 'content-sync-test-'));
  const git = async (cwd: string, ...args: string[]) => {
    const proc = Bun.spawn(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    const output = await new Response(proc.stdout).text(); const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0); return output.trim();
  };
  try {
    const content = join(root, 'content'); await mkdir(content);
    await git(root, 'init'); await git(content, 'init');
    await writeFile(join(content, 'note.md'), 'first'); await git(content, 'add', '.'); await git(content, 'commit', '-m', 'first');
    await writeFile(join(root, '.gitmodules'), '[submodule "content"]\n\tpath = content\n\turl = ./content\n');
    await git(root, 'add', '.gitmodules', 'content'); await git(root, 'commit', '-m', 'initial pointer');
    await writeFile(join(content, 'note.md'), 'second'); await git(content, 'commit', '-am', 'second');
    const candidate = await git(content, 'rev-parse', 'HEAD');
    await selectContentRevision(root, candidate);
    await git(root, 'submodule', 'update', '--init', '--recursive');
    expect(await git(content, 'rev-parse', 'HEAD')).toBe(candidate);
    expect(await git(root, 'rev-parse', ':content')).toBe(candidate);
  } finally { await rm(root, { recursive: true, force: true }); }
});
