import type { Post } from '../posts-types';
import { parsePost, PLURAL_TO_SINGULAR } from './parse-post';

interface PostParams {
	year: string;
	month: string;
	day: string;
	slug: string;
}

export function validPostParams({ year, month, day, slug }: PostParams): boolean {
	if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return false;
	// Keep each URL segment a filename segment, including Unicode slugs.
	if (!slug || slug === '.' || slug === '..' || /[/\\\u0000-\u001f\u007f]/.test(slug)) return false;
	const date = `${year}-${month}-${day}`;
	const parsed = new Date(`${date}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Fetch only the requested post, never the local filesystem or the whole content repository. */
export async function getGitHubPost(
	params: PostParams,
	fetcher: typeof fetch,
	token?: string,
	repository?: { owner: string; repo: string; branch: string }
): Promise<Post | null> {
	if (!validPostParams(params)) return null;
	if (repository && [repository.owner, repository.repo].some(value => !/^[\w.-]+$/.test(value) || value === '.' || value === '..')) throw new Error('Invalid content repository');
	const repo = repository ? `${repository.owner}/${repository.repo}` : 'caseyg/caseyagollan-content';
	const ref = repository ? `?ref=${encodeURIComponent(repository.branch)}` : '';
	const date = `${params.year}-${params.month}-${params.day}`;
	// IndieKit filenames can use the UTC date while permalinks use the local date.
	const dayMillis = 24 * 60 * 60 * 1000;
	const timestamp = Date.parse(`${date}T00:00:00Z`);
	const dates = [date, new Date(timestamp + dayMillis).toISOString().slice(0, 10),
		new Date(timestamp - dayMillis).toISOString().slice(0, 10)];
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github.raw+json',
		'User-Agent': 'caseyagollan-post-fallback',
		'Cache-Control': 'no-cache',
		'X-GitHub-Api-Version': '2022-11-28'
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	// A shared deadline bounds even a lookup that checks every post type.
	const signal = AbortSignal.timeout(8000);
	for (const type of Object.keys(PLURAL_TO_SINGULAR)) {
		for (const filenameDate of dates) {
			const file = `${filenameDate}-${params.slug}.md`;
			const response = await fetcher(
				`https://api.github.com/repos/${repo}/contents/${type}/${encodeURIComponent(file)}${ref}`,
				{ headers, cache: 'no-store', signal }
			);
			if (response.status === 404) continue;
			if (!response.ok) throw new Error(`GitHub content request failed (${response.status})`);
			const post = parsePost(await response.text(), type, file);
			if (post.date.startsWith(date)) return post;
		}
	}
	return null;
}
