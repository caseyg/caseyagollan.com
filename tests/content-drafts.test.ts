import { describe, expect, test } from 'bun:test';
import { listContentDrafts, mergePullRequestBranch, pullRequestBranch } from '../src/lib/server/publishing/content-drafts';

const config = { owner: 'caseyg', repo: 'test-content', branch: 'main', token: 'git-secret' };
const post = (extra: string, body = 'Body text') => `---\ndate: 2026-11-25T23:00:00-05:00\n${extra}\n---\n\n${body}\n`;
const pull = (number: number, ref: string, overrides: Record<string, unknown> = {}) => ({
	number, title: `Pull ${number}`, state: 'open', html_url: `https://github.com/caseyg/test-content/pull/${number}`,
	head: { ref, repo: { full_name: 'caseyg/test-content' } }, base: { ref: 'main' }, ...overrides
});

/** A content repository with files per branch, open pull requests and a code search index. */
function github(options: { branches: Record<string, Record<string, string>>; pulls?: ReturnType<typeof pull>[]; changed?: Record<number, { filename: string; status: string }[]>; search?: string[]; fail?: RegExp; merge?: number }) {
	const requests: { url: string; method: string; body?: unknown }[] = [];
	const fetcher = async (url: string, init: RequestInit) => {
		requests.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined });
		if (options.fail?.test(url)) return new Response(null, { status: 500 });
		if (url.includes('/search/code')) return Response.json({ items: (options.search ?? []).map(path => ({ path })) });
		if (url.endsWith('/merges')) return new Response(options.merge === 201 ? '{}' : null, { status: options.merge ?? 201 });
		const files = url.match(/\/pulls\/(\d+)\/files/);
		if (files) return Response.json(options.changed?.[Number(files[1])] ?? []);
		const one = url.match(/\/pulls\/(\d+)$/);
		if (one) { const found = options.pulls?.find(item => item.number === Number(one[1])); return found ? Response.json(found) : new Response(null, { status: 404 }); }
		if (url.includes('/pulls?')) return Response.json(options.pulls ?? []);
		if (url === 'https://api.github.com/graphql') {
			const { variables } = JSON.parse(init.body as string) as { variables: Record<string, string> };
			const repository: Record<string, unknown> = {};
			for (const [key, expression] of Object.entries(variables)) {
				if (!/^e\d+$/.test(key)) continue;
				const split = expression.lastIndexOf(':');
				const text = options.branches[expression.slice(0, split)]?.[expression.slice(split + 1)];
				repository[`f${key.slice(1)}`] = text === undefined ? null : { oid: 'sha', text, isBinary: false, isTruncated: false };
			}
			return Response.json({ data: { repository } });
		}
		return new Response(null, { status: 404 });
	};
	return { fetcher, requests };
}

describe('content repository drafts', () => {
	test('lists drafts on the published branch and on pull requests, newest first', async () => {
		const { fetcher, requests } = github({
			branches: {
				main: {
					'articles/2025-09-07-testing.md': '---\ndate: 2025-09-07T14:09:09.524Z\ntitle: Testing iA Writer\ndraft: true\n---\n\nTesting\n',
					'notes/2026-11-01-status.md': post('post-status: draft', 'A note kept back'),
					'notes/2026-10-01-published.md': post('category: draft: true')
				},
				'claude/changelog': { 'articles/2026-11-26-changelog.md': post('title: Changelog\ndraft: true'), 'articles/2026-11-20-done.md': post('title: Done') }
			},
			search: ['articles/2025-09-07-testing.md', 'notes/2026-11-01-status.md', 'notes/2026-10-01-published.md', 'README.md'],
			pulls: [pull(21, 'claude/changelog')],
			changed: { 21: [{ filename: 'articles/2026-11-26-changelog.md', status: 'added' }, { filename: 'articles/2026-11-20-done.md', status: 'modified' }, { filename: 'articles/2026-11-19-gone.md', status: 'removed' }] }
		});
		const result = await listContentDrafts(config, fetcher);
		expect(result.error).toBeUndefined();
		expect(result.drafts).toEqual([
			// The permalink's day is the post's local date, not the filename's.
			{ path: '/2026/11/25/changelog/', folder: 'articles', title: 'Changelog', date: '2026-11-25T23:00:00-05:00', pull: { number: 21, title: 'Pull 21' } },
			{ path: '/2026/11/25/status/', folder: 'notes', title: 'A note kept back', date: '2026-11-25T23:00:00-05:00' },
			{ path: '/2025/09/07/testing/', folder: 'articles', title: 'Testing iA Writer', date: '2025-09-07T14:09:09.524Z' }
		]);
		expect(requests.every(request => request.method === 'GET' || request.url.endsWith('/graphql'))).toBe(true);
	});

	test('skips pull requests from forks and into other branches', async () => {
		const { fetcher, requests } = github({
			branches: { fork: { 'notes/2026-11-25-fork.md': post('draft: true') } },
			pulls: [pull(5, 'fork', { head: { ref: 'fork', repo: { full_name: 'someone/test-content' } } }), pull(6, 'fork', { base: { ref: 'other' } })],
			changed: { 5: [{ filename: 'notes/2026-11-25-fork.md', status: 'added' }], 6: [{ filename: 'notes/2026-11-25-fork.md', status: 'added' }] }
		});
		expect((await listContentDrafts(config, fetcher)).drafts).toEqual([]);
		expect(requests.some(request => request.url.includes('/files'))).toBe(false);
	});

	test('one source failing still lists the other', async () => {
		const { fetcher } = github({
			branches: { draft: { 'notes/2026-11-25-kept.md': post('draft: true', 'Kept') } }, fail: /search\/code/,
			pulls: [pull(7, 'draft')], changed: { 7: [{ filename: 'notes/2026-11-25-kept.md', status: 'added' }] }
		});
		const result = await listContentDrafts(config, fetcher);
		expect(result.drafts.map(draft => draft.path)).toEqual(['/2026/11/25/kept/']);
		expect(result.error).toBe('Drafts on the published branch could not be loaded.');
	});
});

describe('pull request branches', () => {
	test('resolves an open pull request from the content repository', async () => {
		const { fetcher } = github({ branches: {}, pulls: [pull(21, 'claude/changelog')] });
		expect(await pullRequestBranch(config, 21, fetcher)).toEqual({ number: 21, title: 'Pull 21', ref: 'claude/changelog', url: 'https://github.com/caseyg/test-content/pull/21' });
	});

	test('refuses closed, forked and missing pull requests', async () => {
		const { fetcher } = github({ branches: {}, pulls: [pull(1, 'done', { state: 'closed' }), pull(2, 'fork', { head: { ref: 'fork', repo: { full_name: 'someone/test-content' } } }), pull(3, 'main')] });
		for (const number of [1, 2, 3]) await expect(pullRequestBranch(config, number, fetcher)).rejects.toMatchObject({ status: 409 });
		await expect(pullRequestBranch(config, 4, fetcher)).rejects.toMatchObject({ status: 404 });
		await expect(pullRequestBranch(config, 0, fetcher)).rejects.toMatchObject({ status: 404 });
	});

	test('merges the branch into the published branch', async () => {
		const { fetcher, requests } = github({ branches: {} });
		await mergePullRequestBranch(config, { number: 21, title: 'Changelog', ref: 'claude/changelog', url: '' }, fetcher);
		expect(requests).toEqual([{ url: 'https://api.github.com/repos/caseyg/test-content/merges', method: 'POST', body: { base: 'main', head: 'claude/changelog', commit_message: 'Publish pull request #21: Changelog' } }]);
		// Already merged counts as done; a conflict says where to finish.
		await mergePullRequestBranch(config, { number: 21, title: 'Changelog', ref: 'claude/changelog', url: '' }, github({ branches: {}, merge: 204 }).fetcher);
		await expect(mergePullRequestBranch(config, { number: 21, title: 'Changelog', ref: 'claude/changelog', url: '' }, github({ branches: {}, merge: 409 }).fetcher)).rejects.toMatchObject({ status: 409 });
	});
});
