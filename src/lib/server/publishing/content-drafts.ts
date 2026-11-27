import { POST_TYPE_PLURALS } from '../../posts-types';
import { ProtocolError, type Fetcher } from './auth';
import { readDocument } from './document';
import { createGitHubStore } from './github';

interface Config { owner: string; repo: string; branch: string; token: string }

/** A post in the content repository whose frontmatter marks it a draft. */
export interface ContentDraft {
	/** The post's own address, such as /2026/11/25/changelog/. */
	path: string;
	/** The content folder, such as articles. */
	folder: string;
	title: string;
	/** The post's date, as written in its frontmatter. */
	date: string;
	/** Set when the draft is on an open pull request's branch rather than the published branch. */
	pull?: { number: number; title: string };
}
export interface PullRequestBranch { number: number; title: string; ref: string; url: string }

const FOLDERS = new Set(Object.values(POST_TYPE_PLURALS));
const POST_PATH = /^([^/]+)\/(\d{4}-\d{2}-\d{2})-([^/]+)\.md$/u;
const MAX_PULLS = 10;
const postPath = (path: unknown): path is string => typeof path === 'string' && FOLDERS.has(path.match(POST_PATH)?.[1] ?? '') && !/[%?#]/.test(path);
const headers = (config: Config) => ({ Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'caseyagollan-publishing' });
const repoUrl = (config: Config) => `https://api.github.com/repos/${config.owner}/${config.repo}`;

async function call(config: Config, fetcher: Fetcher, url: string, init: RequestInit = {}): Promise<Response> {
	try { return await fetcher(url, { ...init, headers: headers(config), cache: 'no-store', signal: AbortSignal.timeout(8000) }); }
	catch { throw new ProtocolError(503, 'temporarily_unavailable', 'The content repository could not be reached.'); }
}

/** The draft a content file holds, or nothing when it is published, deleted or unreadable. */
function draftFrom(file: { path: string; content: string }, pull?: ContentDraft['pull']): ContentDraft | undefined {
	const [, folder, fileDate, slug] = file.path.match(POST_PATH)!;
	let doc;
	try { doc = readDocument(file.content); } catch { return; }
	const { properties } = doc;
	if (properties.deleted?.[0] === true || !(properties['post-status']?.[0] === 'draft' || properties.draft?.[0] === true)) return;
	const published = String(properties.published?.[0] ?? '');
	const day = /^\d{4}-\d{2}-\d{2}/.test(published) ? published.slice(0, 10) : fileDate;
	const content = properties.content?.[0];
	const text = [properties.name?.[0], typeof content === 'string' ? content : undefined, doc.body, properties['bookmark-of']?.[0], properties['in-reply-to']?.[0], properties['like-of']?.[0], properties['repost-of']?.[0]]
		.map(value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '').find(Boolean) ?? slug;
	return {
		path: `/${day.replaceAll('-', '/')}/${encodeURIComponent(slug)}/`, folder,
		title: text.length > 80 ? `${text.slice(0, 79)}…` : text, date: published || fileDate, ...(pull ? { pull } : {})
	};
}

/** Open pull requests from the content repository's own branches into the published branch. */
async function openPulls(config: Config, fetcher: Fetcher): Promise<PullRequestBranch[]> {
	const response = await call(config, fetcher, `${repoUrl(config)}/pulls?state=open&base=${encodeURIComponent(config.branch)}&sort=updated&direction=desc&per_page=30`);
	if (!response.ok) throw new ProtocolError(503, 'temporarily_unavailable', 'Pull requests could not be listed.');
	const pulls = await response.json() as unknown[];
	return (Array.isArray(pulls) ? pulls : []).flatMap(pull => { const branch = pullBranch(config, pull); return branch ? [branch] : []; }).slice(0, MAX_PULLS);
}

function pullBranch(config: Config, value: unknown): PullRequestBranch | undefined {
	const pull = value as { number?: unknown; title?: unknown; state?: unknown; html_url?: unknown; head?: { ref?: unknown; repo?: { full_name?: unknown } | null }; base?: { ref?: unknown } } | null;
	if (!pull || typeof pull.number !== 'number' || pull.state !== 'open' || typeof pull.head?.ref !== 'string' || !pull.head.ref) return;
	// A fork's branch cannot be written or merged with the content token.
	if (String(pull.head.repo?.full_name).toLowerCase() !== `${config.owner}/${config.repo}`.toLowerCase()) return;
	if (pull.base?.ref !== config.branch || pull.head.ref === config.branch) return;
	return { number: pull.number, title: typeof pull.title === 'string' ? pull.title : `#${pull.number}`, ref: pull.head.ref, url: typeof pull.html_url === 'string' ? pull.html_url : `https://github.com/${config.owner}/${config.repo}/pull/${pull.number}` };
}

/**
 * An open pull request's branch, so the post editor can read and write a draft there.
 * Only pull requests from the content repository itself into the published branch qualify.
 */
export async function pullRequestBranch(config: Config, number: number, fetcher: Fetcher = fetch): Promise<PullRequestBranch> {
	if (!Number.isSafeInteger(number) || number < 1) throw new ProtocolError(404, 'invalid_request', 'Pull request not found.');
	const response = await call(config, fetcher, `${repoUrl(config)}/pulls/${number}`);
	if (response.status === 404) throw new ProtocolError(404, 'invalid_request', 'Pull request not found.');
	if (!response.ok) throw new ProtocolError(503, 'temporarily_unavailable', 'The pull request could not be read.');
	const branch = pullBranch(config, await response.json());
	if (!branch) throw new ProtocolError(409, 'invalid_request', `Pull request #${number} is closed, or its branch cannot be edited from here.`);
	return branch;
}

/** Merge a pull request's branch into the published branch, which also marks the pull request merged. */
export async function mergePullRequestBranch(config: Config, pull: PullRequestBranch, fetcher: Fetcher = fetch): Promise<void> {
	const response = await call(config, fetcher, `${repoUrl(config)}/merges`, { method: 'POST', body: JSON.stringify({ base: config.branch, head: pull.ref, commit_message: `Publish pull request #${pull.number}: ${pull.title}` }) });
	// 201 merged; 204 the published branch already holds the branch.
	if (response.status === 201 || response.status === 204) return;
	throw new ProtocolError(response.status === 409 ? 409 : 503, 'invalid_request', response.status === 409
		? `The post is saved as published on pull request #${pull.number}, but its branch conflicts with the published branch. Merge the pull request on GitHub.`
		: `The post is saved as published on pull request #${pull.number}, but merging it failed. Publish again, or merge the pull request on GitHub.`);
}

async function publishedBranchDrafts(config: Config, fetcher: Fetcher): Promise<ContentDraft[]> {
	// Code search narrows a thousand posts to the few that say draft; each hit is then read fresh.
	const searches = await Promise.all(['"draft: true"', '"post-status: draft"'].map(async phrase => {
		const response = await call(config, fetcher, `https://api.github.com/search/code?per_page=50&q=${encodeURIComponent(`${phrase} repo:${config.owner}/${config.repo}`)}`);
		if (!response.ok) throw new ProtocolError(503, 'temporarily_unavailable', 'Drafts in the content repository could not be searched.');
		const result = await response.json() as { items?: { path?: unknown }[] };
		return (result.items ?? []).map(item => item.path).filter(postPath);
	}));
	const paths = [...new Set(searches.flat())];
	if (!paths.length) return [];
	const files = await createGitHubStore(config, fetcher).readMany(paths);
	return files.flatMap(file => draftFrom(file) ?? []);
}

async function pullRequestDrafts(config: Config, fetcher: Fetcher): Promise<ContentDraft[]> {
	const pulls = await openPulls(config, fetcher);
	const found = await Promise.all(pulls.map(async pull => {
		const response = await call(config, fetcher, `${repoUrl(config)}/pulls/${pull.number}/files?per_page=100`);
		if (!response.ok) return [];
		const changed = await response.json() as { filename?: unknown; status?: unknown }[];
		const paths = (Array.isArray(changed) ? changed : []).filter(file => file.status !== 'removed').map(file => file.filename).filter(postPath);
		if (!paths.length) return [];
		const files = await createGitHubStore({ ...config, branch: pull.ref }, fetcher).readMany(paths);
		return files.flatMap(file => draftFrom(file, { number: pull.number, title: pull.title }) ?? []);
	}));
	return found.flat();
}

/**
 * Drafts kept in the content repository: posts marked draft on the published branch, and
 * those on open pull requests. One source failing still lists the other.
 */
export async function listContentDrafts(config: Config, fetcher: Fetcher = fetch): Promise<{ drafts: ContentDraft[]; error?: string }> {
	const [published, pulls] = await Promise.allSettled([publishedBranchDrafts(config, fetcher), pullRequestDrafts(config, fetcher)]);
	const drafts = [...(pulls.status === 'fulfilled' ? pulls.value : []), ...(published.status === 'fulfilled' ? published.value : [])];
	// A draft both merged and still open in a pull request is listed once, as the pull request's.
	const seen = new Set<string>();
	const unique = drafts.filter(draft => !seen.has(draft.path) && seen.add(draft.path)).sort((a, b) => b.date.localeCompare(a.date));
	const failed = published.status === 'rejected' || pulls.status === 'rejected';
	return { drafts: unique, ...(failed ? { error: published.status === 'rejected' && pulls.status === 'rejected' ? 'Drafts in the content repository could not be loaded.' : published.status === 'rejected' ? 'Drafts on the published branch could not be loaded.' : 'Drafts in pull requests could not be loaded.' } : {}) };
}
