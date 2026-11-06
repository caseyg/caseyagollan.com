import { describe, expect, test } from 'bun:test';
import { createPostReader } from '../src/lib/server/build-posts';
import { getGitHubPost } from '../src/lib/server/github-posts';
import { parsePost, isPublicPost } from '../src/lib/server/parse-post';
import { renderContentSync } from '../src/lib/utils/renderContent';
import { createDocument } from '../src/lib/server/publishing/document';

const markdown = (flags = '') => `---\ndate: 2026-11-06T12:00:00-05:00\n${flags}---\n# literal <script>alert(1)</script>`;

describe('public publishing output', () => {
  test('filters unpublished/deleted files out of the bundled collection', async () => {
    const files = Object.fromEntries(['', 'post-status: [draft]\n', 'visibility: private\n', 'deleted: [true]\n'].map((flags, i) => [`/content/notes/2026-11-06-${i}.md`, markdown(flags)]));
    expect((await createPostReader(files, false)()).map(p => p.slug)).toEqual(['0']);
  });

  test('exposes publication flags for permalink fallback checks', async () => {
    const post = await getGitHubPost({ year: '2026', month: '11', day: '06', slug: 'test' }, (async () => new Response(markdown('deleted: [true]\n'))) as unknown as typeof fetch);
    expect(post?.deleted).toBe(true);
    expect(isPublicPost(post!)).toBe(false);
  });

  test('treats incoming text literally while preserving legacy Markdown rendering', () => {
    const post = parsePost(markdown('_micropubContentFormat: text\n'), 'notes', '2026-11-06-note.md');
    const html = renderContentSync(post.content, post.contentFormat);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<h1>');
    expect(html).toContain('&lt;script&gt;');
    expect(renderContentSync('**Legacy**')).toContain('<strong>Legacy</strong>');
  });

  test('normalizes published relationship fields and both photo object shapes', () => {
    const post = parsePost('---\ndate: 2026-11-06T12:00:00-05:00\ninReplyTo: https://example.com/original\nphoto:\n  - value: https://media.example/a.jpg\n    alt: Moon\n---\nReply', 'replies', '2026-11-06-reply.md');
    expect(post.inReplyTo).toBe('https://example.com/original');
    expect(post.photo?.[0]).toMatchObject({ url: 'https://media.example/a.jpg', alt: 'Moon' });
  });

  test('keeps a newly written summary usable by public metadata', () => {
    const post = parsePost(createDocument({ published: ['2026-11-06T12:00:00-05:00'], summary: ['A description'], content: ['Body'] }), 'notes', '2026-11-06-summary.md');
    expect(post.summary).toBe('A description');
  });
});
