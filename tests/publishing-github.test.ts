import { describe, expect, test } from 'bun:test';
import { createGitHubStore, GitHubStoreError } from '../src/lib/server/publishing/github';

const config = { owner: 'caseyg', repo: 'content-test', branch: 'feature/posts', token: 'test-secret' };
const path = 'notes/2026-11-06-月.md';
const base64 = (text: string) => btoa(Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join(''));

describe('publishing GitHub store', () => {
  test('reads the configured branch and UTF-8 file with a revision and no caching', async () => {
    const store = createGitHubStore(config, async (url, init) => {
      expect(url).toBe('https://api.github.com/repos/caseyg/content-test/contents/notes/2026-11-06-%E6%9C%88.md?ref=feature%2Fposts');
      expect(init.cache).toBe('no-store');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-secret');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ type: 'file', path, sha: 'original-sha', encoding: 'base64', content: base64('Hello 月 👋') });
    });
    expect(await store.read(path)).toEqual({ path, sha: 'original-sha', content: 'Hello 月 👋' });
  });

  test('returns null for 404 but keeps upstream errors distinct', async () => {
    expect(await createGitHubStore(config, async () => new Response(null, { status: 404 })).read(path)).toBeNull();
    for (const status of [401, 403, 429, 500]) {
      try {
        await createGitHubStore(config, async () => new Response('sensitive upstream body', { status })).read(path);
        throw new Error('Expected failure');
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubStoreError);
        expect((error as GitHubStoreError).status).toBe(status);
        expect(String(error)).not.toContain('sensitive');
      }
    }
  });

  test('uses the caller revision for writes and returns both new revisions', async () => {
    const store = createGitHubStore(config, async (_url, init) => {
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body as string)).toEqual({ message: 'Edit note', branch: 'feature/posts', sha: 'original-sha', content: base64('Updated 月') });
      return Response.json({ content: { sha: 'new-blob' }, commit: { sha: 'new-commit' } });
    });
    expect(await store.write(path, 'Updated 月', { sha: 'original-sha', message: 'Edit note' })).toEqual({ sha: 'new-blob', commit: 'new-commit' });
  });

  test('omits SHA for create, without needing a Buffer global', async () => {
    const original = globalThis.Buffer;
    let body: Record<string, unknown> = {};
    const response = new Response(JSON.stringify({ content: { sha: 'new-blob' }, commit: { sha: 'new-commit' } }));
    try {
      Object.defineProperty(globalThis, 'Buffer', { value: undefined, configurable: true, writable: true });
      const store = createGitHubStore(config, async (_url, init) => { body = JSON.parse(init.body as string); return response; });
      await store.write(path, '👋', { message: 'Create note' });
      expect(body).not.toHaveProperty('sha');
      expect(body.content).toBe(base64('👋'));
    } finally { globalThis.Buffer = original; }
  });

  test('does not retry conflicts, rejections, or ambiguous writes', async () => {
    for (const status of [409, 422, 503]) {
      let calls = 0;
      const store = createGitHubStore(config, async () => { calls++; return new Response(null, { status }); });
      await expect(store.write(path, 'hello', { message: 'Create' })).rejects.toBeInstanceOf(GitHubStoreError);
      expect(calls).toBe(1);
    }
    let calls = 0;
    const store = createGitHubStore(config, async () => { calls++; throw new Error('Timeout containing secret'); });
    try { await store.write(path, 'hello', { message: 'Create' }); }
    catch (error) {
      expect((error as GitHubStoreError).outcome).toBe('unknown');
      expect(String(error)).not.toContain('secret');
    }
    expect(calls).toBe(1);
  });

  test('rejects unsafe paths, impossible dates, empty revisions, and oversized content before fetching', async () => {
    let calls = 0;
    const store = createGitHubStore(config, async () => { calls++; return new Response(); });
    for (const invalid of ['../secrets', 'notes/../config.md', 'other/2026-11-06-x.md', 'notes/2026-02-30-x.md', 'notes/2026-11-06-%2e%2e.md', 'notes/2026-11-06-a\\b.md']) {
      await expect(store.read(invalid)).rejects.toThrow();
      await expect(store.write(invalid, 'x', { message: 'Create' })).rejects.toThrow();
    }
    await expect(store.write(path, 'x', { sha: '', message: 'Edit' })).rejects.toThrow();
    await expect(store.write(path, 'x'.repeat(1024 * 1024 + 1), { message: 'Create' })).rejects.toThrow();
    expect(calls).toBe(0);
  });

  test('rejects malformed upstream file and write responses', async () => {
    for (const value of [{ type: 'dir' }, { type: 'file', path, sha: 'sha', encoding: 'none' }, { type: 'file', path: 'wrong', sha: 'sha', encoding: 'base64', content: 'eA==' }]) {
      await expect(createGitHubStore(config, async () => Response.json(value)).read(path)).rejects.toThrow();
    }
    await expect(createGitHubStore(config, async () => Response.json({})).write(path, 'x', { message: 'Create' })).rejects.toThrow();
  });
});
