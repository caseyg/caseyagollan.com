import { validPostParams } from '../github-posts';
import { POST_TYPE_PLURALS } from '../../posts-types';

interface Config { owner: string; repo: string; branch: string; token: string }
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type Outcome = 'rejected' | 'conflict' | 'unavailable' | 'unknown';

export class GitHubStoreError extends Error {
	constructor(public readonly outcome: Outcome, public readonly status?: number) {
		super(`GitHub content ${outcome}${status ? ` (${status})` : ''}`);
		this.name = 'GitHubStoreError';
	}
}

const folders = new Set(Object.values(POST_TYPE_PLURALS));
const maxBytes = 1024 * 1024;

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid response object');
	return value as Record<string, unknown>;
}

function validatePath(path: string): void {
	// Private integration ledger: IDs only, never preview data.
	if (path === 'integrations/readwise.json') return;
	const match = path.match(/^([^/]+)\/(\d{4})-(\d{2})-(\d{2})-(.+)\.md$/u);
	if (!match || !folders.has(match[1]) || /[%?#]/.test(path) || !validPostParams({
		year: match[2], month: match[3], day: match[4], slug: match[5]
	})) throw new Error('Invalid content path');
}

function encode(content: string): string {
	const bytes = new TextEncoder().encode(content);
	if (bytes.length > maxBytes) throw new Error('Content exceeds 1 MiB');
	return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}

function decode(content: string): string {
	const raw = atob(content.replace(/\s/g, ''));
	if (raw.length > maxBytes) throw new Error('Content exceeds 1 MiB');
	return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, char => char.charCodeAt(0)));
}

/** No retries: a failed response after PUT can leave the outcome ambiguous. */
export function createGitHubStore(config: Config, fetcher: Fetcher = fetch) {
	for (const value of [config.owner, config.repo]) {
		if (!/^[\w.-]+$/.test(value) || value === '.' || value === '..') throw new Error('Invalid GitHub repository');
	}
	if (!config.branch.trim() || !config.token.trim()) throw new Error('GitHub branch and credential are required');
	const endpoint = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/`;
	const headers = {
		Authorization: `Bearer ${config.token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'caseyagollan-publishing'
	};
	const fileUrl = (path: string) => endpoint + path.split('/').map(encodeURIComponent).join('/');

	async function request(url: string, init: RequestInit, writing = false) {
		try {
			return await fetcher(url, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
		} catch {
			throw new GitHubStoreError(writing ? 'unknown' : 'unavailable');
		}
	}

	return {
		async head(): Promise<string> {
			const response = await request(`https://api.github.com/repos/${config.owner}/${config.repo}/git/ref/heads/${config.branch.split('/').map(encodeURIComponent).join('/')}`, { method: 'GET' });
			if (!response.ok) throw new GitHubStoreError('unavailable', response.status);
			try {
				const ref = object(await response.json());
				const target = object(ref.object);
				if (typeof target.sha !== 'string' || !target.sha) throw new Error();
				return target.sha;
			} catch { throw new GitHubStoreError('unavailable'); }
		},
		async read(path: string): Promise<{ path: string; sha: string; content: string } | null> {
			validatePath(path);
			const response = await request(`${fileUrl(path)}?ref=${encodeURIComponent(config.branch)}`, { method: 'GET' });
			if (response.status === 404) return null;
			if (!response.ok) throw new GitHubStoreError('unavailable', response.status);
			try {
				const file = object(await response.json());
				if (file.type !== 'file' || file.path !== path || typeof file.sha !== 'string' || !file.sha || file.encoding !== 'base64' || typeof file.content !== 'string') {
					throw new Error('Invalid file response');
				}
				return { path, sha: file.sha, content: decode(file.content) };
			} catch { throw new GitHubStoreError('unavailable', response.status); }
		},
		async write(path: string, content: string, options: { sha?: string; expectedHead?: string; message: string }): Promise<{ sha: string; commit: string }> {
			validatePath(path);
			if (!options.message.trim() || (options.sha !== undefined && !options.sha.trim())) throw new Error('Commit message and supplied revision must not be empty');
			if (options.expectedHead !== undefined) {
				if (!options.expectedHead.trim()) throw new Error('Expected head must not be empty');
				const response = await request('https://api.github.com/graphql', {
					method: 'POST', body: JSON.stringify({
						query: 'mutation Publish($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }',
						variables: { input: {
							branch: { repositoryNameWithOwner: `${config.owner}/${config.repo}`, branchName: config.branch },
							expectedHeadOid: options.expectedHead, message: { headline: options.message },
							fileChanges: { additions: [{ path, contents: encode(content) }] }
						} }
					})
				}, true);
				if (!response.ok) throw new GitHubStoreError(response.status >= 500 ? 'unknown' : 'rejected', response.status);
				let result: Record<string, unknown>;
				try { result = object(await response.json()); } catch { throw new GitHubStoreError('unknown'); }
				if (Array.isArray(result.errors) && result.errors.length) {
					const stale = result.errors.some(error => error?.type === 'STALE_DATA' || /expected.*(branch|head)|branch.*(moved|point)/i.test(String(error?.message)));
					throw new GitHubStoreError(stale ? 'conflict' : 'rejected');
				}
				try {
					const commit = object(object(object(result.data).createCommitOnBranch).commit).oid;
					if (typeof commit !== 'string' || !commit) throw new Error();
					const bytes = new TextEncoder().encode(content);
					const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`);
					const blob = new Uint8Array(prefix.length + bytes.length);
					blob.set(prefix); blob.set(bytes, prefix.length);
					const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', blob)), byte => byte.toString(16).padStart(2, '0')).join('');
					return { sha, commit };
				} catch { throw new GitHubStoreError('unknown'); }
			}
			const response = await request(fileUrl(path), {
				method: 'PUT',
				body: JSON.stringify({ message: options.message, branch: config.branch, content: encode(content), ...(options.sha !== undefined ? { sha: options.sha } : {}) })
			}, true);
			if (!response.ok) {
				throw new GitHubStoreError(response.status === 409 ? 'conflict' : response.status >= 500 ? 'unknown' : 'rejected', response.status);
			}
			try {
				const result = object(await response.json());
				const blob = object(result.content);
				const commit = object(result.commit);
				if (typeof blob.sha !== 'string' || !blob.sha || typeof commit.sha !== 'string' || !commit.sha) throw new Error('Invalid commit response');
				return { sha: blob.sha, commit: commit.sha };
			} catch { throw new GitHubStoreError('unknown', response.status); }
		}
	};
}
