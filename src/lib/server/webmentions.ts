import { fromHtml } from 'hast-util-from-html';
import { sanitize, type Schema } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import {
	countMentions,
	emptyModeration,
	isHidden,
	mergeMentions,
	normalizeMention,
	parseModeration,
	targetPath,
	type MentionCounts,
	type MentionModeration,
	type StoredMention
} from '../webmentions';

/*
 * The site's own copy of its Webmentions, in the publishing-state bucket:
 *
 *   webmentions/state.json           how far the copy has read webmention.io (`sinceId`)
 *   webmentions/posts/<path>.json    every mention of one post, oldest first
 *   webmentions/index.json           per post, the ids, kinds and authors, for counts
 *   webmentions/moderation.json      what the owner hid
 *
 * Previews get their own, empty bucket and no cron, so until a bucket has been synced once,
 * pages read webmention.io live instead (`readMentions`).
 */

const PREFIX = 'webmentions/';
const STATE_KEY = `${PREFIX}state.json`;
const INDEX_KEY = `${PREFIX}index.json`;
const MODERATION_KEY = `${PREFIX}moderation.json`;
const DOMAIN = 'caseyagollan.com';
const API = 'https://webmention.io/api/mentions.jf2';
const PER_PAGE = 100;
/** A first sync of a large archive takes several runs; each stays well inside a cron's limits. */
const MAX_PAGES = 10;

export interface ArchiveState {
	sinceId: number;
	syncedAt: string;
	total: number;
}

type IndexEntry = Pick<StoredMention, 'id' | 'kind' | 'author' | 'source'> & { content?: boolean };
type ArchiveIndex = Record<string, IndexEntry[]>;

export interface WebmentionEnvironment {
	PUBLISHING_STATE?: R2Bucket;
	WEBMENTION_IO_TOKEN?: string;
}

const postKey = (path: string) => `${PREFIX}posts/${encodeURIComponent(path)}.json`;
const json = { httpMetadata: { contentType: 'application/json' } };

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
	const object = await bucket.get(key);
	if (!object) return null;
	try {
		return (await object.json()) as T;
	} catch {
		return null;
	}
}

export async function readState(bucket: R2Bucket | undefined): Promise<ArchiveState | null> {
	if (!bucket) return null;
	const state = await readJson<ArchiveState>(bucket, STATE_KEY);
	return state && Number.isSafeInteger(state.sinceId) ? state : null;
}

export async function readModeration(bucket: R2Bucket | undefined): Promise<MentionModeration> {
	if (!bucket) return emptyModeration();
	return parseModeration(await readJson(bucket, MODERATION_KEY));
}

export async function writeModeration(bucket: R2Bucket, moderation: MentionModeration): Promise<void> {
	await bucket.put(MODERATION_KEY, JSON.stringify(moderation), json);
}

async function readPost(bucket: R2Bucket, path: string): Promise<StoredMention[]> {
	const list = await readJson<unknown[]>(bucket, postKey(path));
	return Array.isArray(list) ? list.map(normalizeStored).filter((m): m is StoredMention => !!m) : [];
}

/** Stored mentions are re-checked on the way out, so a hand-edited file can't break a page. */
function normalizeStored(value: unknown): StoredMention | null {
	if (!value || typeof value !== 'object') return null;
	const m = value as StoredMention;
	return Number.isSafeInteger(m.id) && typeof m.target === 'string' && typeof m.url === 'string' && m.author && typeof m.author === 'object' ? m : null;
}

export interface SyncResult {
	skipped?: 'no-bucket' | 'no-token';
	fetched: number;
	stored: number;
	posts: number;
	sinceId: number;
	more: boolean;
}

/**
 * Copies mentions that arrived since the last run. webmention.io returns them oldest first
 * after `since_id`, so a run that stops early carries on from the same place next time.
 */
export async function syncWebmentions(env: WebmentionEnvironment, fetcher: typeof fetch = fetch, now = () => new Date()): Promise<SyncResult> {
	const bucket = env.PUBLISHING_STATE;
	const token = env.WEBMENTION_IO_TOKEN;
	const state = await readState(bucket);
	const result: SyncResult = { fetched: 0, stored: 0, posts: 0, sinceId: state?.sinceId ?? 0, more: false };
	if (!bucket) return { ...result, skipped: 'no-bucket' };
	if (!token) return { ...result, skipped: 'no-token' };

	const incoming: StoredMention[] = [];
	let sinceId = result.sinceId;
	for (let page = 0; page < MAX_PAGES; page++) {
		const url = new URL(API);
		url.search = new URLSearchParams({ domain: DOMAIN, token, since_id: String(sinceId), 'sort-dir': 'up', 'per-page': String(PER_PAGE) }).toString();
		const response = await fetcher(url, { headers: { accept: 'application/json' } });
		if (!response.ok) throw new Error(`webmention.io returned ${response.status}`);
		const data = (await response.json()) as { children?: unknown[] };
		const children = Array.isArray(data.children) ? data.children : [];
		result.fetched += children.length;
		for (const child of children) {
			const id = Number((child as Record<string, unknown>)?.['wm-id']);
			if (Number.isSafeInteger(id) && id > sinceId) sinceId = id;
			const mention = normalizeMention(child);
			if (mention) incoming.push(mention);
		}
		if (children.length < PER_PAGE) break;
		if (page === MAX_PAGES - 1) result.more = true;
	}

	if (incoming.length) {
		const byPost = new Map<string, StoredMention[]>();
		for (const mention of incoming) byPost.set(mention.target, [...(byPost.get(mention.target) ?? []), mention]);
		const index = (await readJson<ArchiveIndex>(bucket, INDEX_KEY)) ?? {};
		for (const [path, mentions] of byPost) {
			const merged = mergeMentions(await readPost(bucket, path), mentions);
			await bucket.put(postKey(path), JSON.stringify(merged), json);
			index[path] = merged.map(({ id, kind, author, source, html, text }) => ({ id, kind, author: { name: author.name, url: author.url, photo: '' }, source, ...(html || text ? { content: true } : {}) }));
		}
		await bucket.put(INDEX_KEY, JSON.stringify(index), json);
		result.stored = incoming.length;
		result.posts = byPost.size;
	}

	const total = (state?.total ?? 0) + incoming.length;
	await bucket.put(STATE_KEY, JSON.stringify({ sinceId, syncedAt: now().toISOString(), total } satisfies ArchiveState), json);
	result.sinceId = sinceId;
	return result;
}

/** Mentions of one post across its addresses, old ones included, read live until the copy exists. */
export async function readMentions(env: WebmentionEnvironment, paths: string[], fetcher: typeof fetch = fetch): Promise<{ mentions: StoredMention[]; archived: boolean }> {
	const bucket = env.PUBLISHING_STATE;
	if (bucket && (await readState(bucket))) {
		const lists = await Promise.all(paths.map((path) => readPost(bucket, path)));
		return { mentions: mergeMentions([], lists.flat()), archived: true };
	}
	const lists = await Promise.all(paths.map((path) => liveMentions(path, fetcher)));
	return { mentions: mergeMentions([], lists.flat()), archived: false };
}

async function liveMentions(path: string, fetcher: typeof fetch): Promise<StoredMention[]> {
	const url = new URL(API);
	url.search = new URLSearchParams({ target: `https://${DOMAIN}${path}`, 'per-page': String(PER_PAGE) }).toString();
	try {
		const response = await fetcher(url, { headers: { accept: 'application/json' } });
		if (!response.ok) return [];
		const data = (await response.json()) as { children?: unknown[] };
		return (Array.isArray(data.children) ? data.children : []).map(normalizeMention).filter((m): m is StoredMention => !!m);
	} catch {
		return [];
	}
}

/** Visible counts for every post that has mentions, for the chips in feeds. */
export async function readCounts(bucket: R2Bucket | undefined): Promise<Record<string, MentionCounts> | null> {
	if (!bucket || !(await readState(bucket))) return null;
	const [index, moderation] = await Promise.all([readJson<ArchiveIndex>(bucket, INDEX_KEY), readModeration(bucket)]);
	const counts: Record<string, MentionCounts> = {};
	for (const [path, entries] of Object.entries(index ?? {})) {
		const visible = entries
			.map((entry) => ({ ...entry, target: path, url: entry.source, ...(entry.content ? { text: ' ' } : {}) }) as StoredMention)
			.filter((mention) => !isHidden(mention, moderation));
		const count = countMentions(visible);
		if (count.like || count.repost || count.reply) counts[path] = count;
	}
	return counts;
}

export function postPaths(values: string[]): string[] {
	return [...new Set(values.map((value) => targetPath(value)).filter((path): path is string => !!path))].slice(0, 10);
}

const SCHEMA: Schema = {
	tagNames: ['a', 'p', 'br', 'b', 'i', 'em', 'strong', 'span', 'blockquote', 'code', 'ul', 'ol', 'li'],
	attributes: { a: ['href'] },
	protocols: { href: ['http', 'https'] },
	strip: ['script', 'style', 'template', 'svg', 'math', 'iframe', 'object', 'embed', 'form'],
	required: { a: { rel: 'nofollow ugc noopener', target: '_blank' } },
	clobberPrefix: '',
	clobber: []
};

/** The markup a page may show for a mention: text, links and simple emphasis only. */
export function sanitizeMentionHtml(html: string): string {
	return toHtml(sanitize(fromHtml(html, { fragment: true }), SCHEMA));
}

/** What a page receives: content made safe, and nothing kept only for the archive. */
export function publicMention(mention: StoredMention): StoredMention {
	const { html, ...rest } = mention;
	return html ? { ...rest, html: sanitizeMentionHtml(html) } : rest;
}
