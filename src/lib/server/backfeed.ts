import { SITE_IDENTITY } from '../identity';
import { nativeId, targetPath, type StoredMention } from '../webmentions';
import { blueskyHtml } from './publishing/bluesky-richtext';

/*
 * Replies, favorites and reposts read straight from the Mastodon and Bluesky copies of each
 * post (its `syndication` URLs), so they show without Bridgy and with each reply under the one
 * it answers. They are stored next to the Webmention copy, in the publishing-state bucket:
 *
 *   webmentions/backfeed/state.json          when each post was last read, and Casey's DID
 *   webmentions/backfeed/posts/<path>.json   one post's responses, replaced on every read
 *   webmentions/backfeed/index.json          per post, ids, kinds and authors, for counts
 *
 * Each read replaces the post's file, so a deleted reply disappears. The posts to read come
 * from the prerendered `/backfeed.json`. Recent posts are read often and old ones weekly
 * (`refreshAfter`), a few per cron run. Until a bucket has been read once (previews), a post
 * page reads its own copies live instead (`readBackfeed`).
 */

const PREFIX = 'webmentions/backfeed/';
const STATE_KEY = `${PREFIX}state.json`;
const INDEX_KEY = `${PREFIX}index.json`;
const BLUESKY_API = 'https://public.api.bsky.app/xrpc/';
/** Posts read per cron run. Each takes about three requests per network. */
const POSTS_PER_RUN = 6;
/** Favorites and reposts are read in pages of 80 (Mastodon) or 100 (Bluesky), at most this many pages. */
const MAX_PAGES = 3;
const TIMEOUT = 10_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface BackfeedTarget {
	/** The post's path on this site, which its responses are stored under. */
	path: string;
	published: string;
	/** The post's own copies on Mastodon and Bluesky, first post of a thread first. */
	syndication: string[];
}

export interface BackfeedState {
	/** Casey's Bluesky DID, so copies linked by DID are recognised as Casey's. */
	did?: string;
	/** When each post was last read. */
	checked: Record<string, string>;
	syncedAt: string;
}

type IndexEntry = Pick<StoredMention, 'id' | 'kind' | 'author' | 'source' | 'url'> & { content?: boolean };

export interface BackfeedEnvironment {
	PUBLISHING_STATE?: R2Bucket;
	ASSETS?: Pick<Fetcher, 'fetch'>;
}

const json = { httpMetadata: { contentType: 'application/json' } };
const postKey = (path: string) => `${PREFIX}posts/${encodeURIComponent(path)}.json`;

/** Where Casey posts, from the site identity: `{ mastodon: { origin, user }, bluesky: handle }`. */
export function ownAccounts() {
	let mastodon: { origin: string; user: string } | undefined;
	let bluesky: string | undefined;
	for (const profile of SITE_IDENTITY.profiles) {
		const url = new URL(profile.href);
		if (profile.label === 'Mastodon') mastodon = { origin: url.origin, user: url.pathname.replace(/^\/@/, '').replace(/\/$/, '') };
		if (url.hostname === 'bsky.app') bluesky = url.pathname.split('/')[2];
	}
	return { mastodon, bluesky };
}

export type SocialCopy = { network: 'mastodon'; url: string; origin: string; id: string } | { network: 'bluesky'; url: string; actor: string; rkey: string };

/**
 * Casey's own copy on Mastodon or Bluesky, or null for anyone else's post. Bluesky copies linked
 * by DID count only when the DID is known to be Casey's (`did`); callers without it get them
 * all and check later.
 */
export function socialCopy(value: string, did?: string): SocialCopy | null {
	const { mastodon, bluesky } = ownAccounts();
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (mastodon && url.origin === mastodon.origin) {
		const user = mastodon.user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const id = url.pathname.match(new RegExp(`^/(?:@${user}|users/${user}/statuses)/(\\d+)/?$`))?.[1];
		return id ? { network: 'mastodon', url: `${mastodon.origin}/@${mastodon.user}/${id}`, origin: mastodon.origin, id } : null;
	}
	if (url.hostname === 'bsky.app') {
		const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([a-z0-9]+)\/?$/i);
		if (!match) return null;
		const actor = decodeURIComponent(match[1]).toLowerCase();
		const own = actor === bluesky?.toLowerCase() || (actor.startsWith('did:') && (did === undefined || actor === did));
		return own ? { network: 'bluesky', url: url.href, actor, rkey: match[2] } : null;
	}
	return null;
}

/** How long a post's responses stay fresh: minutes for a new post, a week for an old one. */
export function refreshAfter(published: string, now: number): number {
	const age = now - Date.parse(published);
	if (!(age >= 0)) return 10 * MINUTE;
	if (age < 2 * DAY) return 10 * MINUTE;
	if (age < 14 * DAY) return HOUR;
	if (age < 90 * DAY) return 12 * HOUR;
	return 7 * DAY;
}

type Fetch = typeof fetch;

async function getJson(fetcher: Fetch, url: string): Promise<{ status: number; data: any }> {
	const response = await fetcher(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
	if (response.status === 404 || response.status === 410 || response.status === 400) return { status: response.status, data: null };
	if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
	return { status: response.status, data: await response.json() };
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const httpUrl = (value: unknown) => {
	try {
		const url = new URL(text(value));
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
	} catch {
		return '';
	}
};

function mention(target: string, network: 'mastodon' | 'bluesky', kind: StoredMention['kind'], url: string, author: StoredMention['author'], extra: Partial<StoredMention> = {}): StoredMention {
	return { id: nativeId(url), kind, target, url, source: url, author, network, ...extra };
}

/** Mastodon: replies from the status's context, then who favorited and boosted it. */
async function readMastodon(copy: Extract<SocialCopy, { network: 'mastodon' }>, target: string, own: Set<string>, fetcher: Fetch): Promise<StoredMention[]> {
	const api = `${copy.origin}/api/v1/statuses/${copy.id}`;
	const context = await getJson(fetcher, `${api}/context`);
	if (!context.data) return [];
	const out: StoredMention[] = [];
	const descendants: any[] = Array.isArray(context.data.descendants) ? context.data.descendants : [];
	// A reply's parent is named by the local id; map ids to addresses. The post itself and the
	// rest of its own thread are not replies, so their children sit at the top.
	const urls = new Map<string, string>();
	for (const status of descendants) urls.set(String(status.id), httpUrl(status.url) || httpUrl(status.uri));
	const skip = new Set([copy.id]);
	// Descendants come parents first, so a chain of Casey's own replies to the post is followed.
	const caseyAccount = `${copy.origin}/@${ownAccounts().mastodon?.user}`;
	for (const status of descendants) {
		const url = urls.get(String(status.id));
		if (!url) continue;
		const continues = httpUrl(status.account?.url) === caseyAccount && skip.has(String(status.in_reply_to_id ?? ''));
		if (own.has(url) || own.has(httpUrl(status.uri)) || continues) skip.add(String(status.id));
	}
	for (const status of descendants) {
		const url = urls.get(String(status.id));
		if (!url || skip.has(String(status.id)) || (status.visibility !== 'public' && status.visibility !== 'unlisted')) continue;
		const parentId = String(status.in_reply_to_id ?? '');
		const parent = skip.has(parentId) ? undefined : urls.get(parentId);
		out.push(mention(target, 'mastodon', 'reply', url, account(status.account), {
			published: text(status.created_at) || undefined,
			html: text(status.content) || undefined,
			...(parent ? { parent } : {})
		}));
	}
	for (const [kind, path, fragment] of [['like', 'favourited_by', 'favorited-by'], ['repost', 'reblogged_by', 'reblogged-by']] as const) {
		let next: string | undefined = `${api}/${path}?limit=80`;
		for (let page = 0; next && page < MAX_PAGES; page++) {
			const response: Response = await fetcher(next, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
			if (!response.ok) break;
			const accounts = (await response.json()) as any[];
			for (const person of Array.isArray(accounts) ? accounts : []) {
				// The same address Bridgy gives these, so the two copies are recognised as one.
				out.push(mention(target, 'mastodon', kind, `${copy.url}#${fragment}-${person.id}`, account(person)));
			}
			next = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
		}
	}
	return out;
}

function account(person: any): StoredMention['author'] {
	return { name: text(person?.display_name) || text(person?.username), url: httpUrl(person?.url), photo: httpUrl(person?.avatar_static) || httpUrl(person?.avatar) };
}

function blueskyAuthor(person: any): StoredMention['author'] {
	const handle = text(person?.handle);
	const profile = handle && handle !== 'handle.invalid' ? handle : text(person?.did);
	return { name: text(person?.displayName) || handle, url: profile ? `https://bsky.app/profile/${profile}` : '', photo: httpUrl(person?.avatar) };
}

function blueskyUrl(post: any): string {
	const rkey = text(post?.uri).split('/').pop();
	const handle = text(post?.author?.handle);
	const actor = handle && handle !== 'handle.invalid' ? handle : text(post?.author?.did);
	return rkey && actor ? `https://bsky.app/profile/${actor}/post/${rkey}` : '';
}

/** Bluesky: the whole reply tree in one request, then who liked and reposted the post. */
async function readBluesky(copy: Extract<SocialCopy, { network: 'bluesky' }>, target: string, own: Set<string>, fetcher: Fetch): Promise<StoredMention[]> {
	const uri = `at://${copy.actor}/app.bsky.feed.post/${copy.rkey}`;
	const thread = await getJson(fetcher, `${BLUESKY_API}app.bsky.feed.getPostThread?${new URLSearchParams({ uri, depth: '20', parentHeight: '0' })}`);
	const root = thread.data?.thread;
	if (root?.$type !== 'app.bsky.feed.defs#threadViewPost') return [];
	const out: StoredMention[] = [];
	const ownKeys = new Set([...own].map((url) => url.split('/').pop()));
	const walk = (node: any, parent: string | undefined) => {
		for (const child of Array.isArray(node?.replies) ? node.replies : []) {
			if (child?.$type !== 'app.bsky.feed.defs#threadViewPost' || !child.post) continue;
			const url = blueskyUrl(child.post);
			if (!url) continue;
			const labels: any[] = Array.isArray(child.post.labels) ? child.post.labels : [];
			// Casey's own thread posts, and Casey's replies continuing them, belong to the post.
			// Replies a labeller hid stay hidden.
			const ownPost = child.post.author?.did === root.post?.author?.did && (ownKeys.has(url.split('/').pop()) || parent === undefined);
			if (ownPost) {
				walk(child, parent);
				continue;
			}
			if (labels.some((label) => label?.val === '!hide' || label?.val === '!takedown')) continue;
			const record = child.post.record ?? {};
			out.push(mention(target, 'bluesky', 'reply', url, blueskyAuthor(child.post.author), {
				published: text(record.createdAt) || text(child.post.indexedAt) || undefined,
				text: text(record.text) || undefined,
				html: text(record.text) ? blueskyHtml(record.text, record.facets) : undefined,
				...(parent ? { parent } : {})
			}));
			walk(child, url);
		}
	};
	walk(root, undefined);
	const canonical = blueskyUrl(root.post) || copy.url;
	// Likes and reposts are only found by the post's DID address, not its handle one.
	const recordUri = text(root.post?.uri) || uri;
	for (const [kind, method, field, fragment] of [['like', 'getLikes', 'likes', 'liked_by'], ['repost', 'getRepostedBy', 'repostedBy', 'reposted_by']] as const) {
		let cursor: string | undefined;
		for (let page = 0; page < MAX_PAGES; page++) {
			const query = new URLSearchParams({ uri: recordUri, limit: '100', ...(cursor ? { cursor } : {}) });
			const { data } = await getJson(fetcher, `${BLUESKY_API}app.bsky.feed.${method}?${query}`);
			const list: any[] = Array.isArray(data?.[field]) ? data[field] : [];
			for (const item of list) {
				const person = kind === 'like' ? item.actor : item;
				if (!person?.did) continue;
				out.push(mention(target, 'bluesky', kind, `${canonical}#${fragment}_${person.did}`, blueskyAuthor(person), kind === 'like' && text(item.createdAt) ? { published: text(item.createdAt) } : {}));
			}
			cursor = typeof data?.cursor === 'string' && list.length ? data.cursor : undefined;
			if (!cursor) break;
		}
	}
	return out;
}

/** Every response to one post's own social copies, de-duplicated by id. */
export async function readTarget(target: BackfeedTarget, did: string | undefined, fetcher: Fetch = fetch): Promise<StoredMention[]> {
	const copies = target.syndication.map((url) => socialCopy(url, did)).filter((copy): copy is SocialCopy => !!copy);
	const own = new Set(copies.map((copy) => copy.url));
	for (const url of target.syndication) own.add(url);
	const lists: StoredMention[][] = [];
	// A thread's later posts are part of the post; read responses to its first post on each network.
	const firsts = new Map<string, SocialCopy>();
	for (const copy of copies) if (!firsts.has(copy.network)) firsts.set(copy.network, copy);
	for (const copy of firsts.values()) {
		lists.push(copy.network === 'mastodon' ? await readMastodon(copy, target.path, own, fetcher) : await readBluesky(copy, target.path, own, fetcher));
	}
	const byId = new Map<number, StoredMention>();
	for (const item of lists.flat()) byId.set(item.id, item);
	return [...byId.values()];
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
	const object = await bucket.get(key);
	if (!object) return null;
	try {
		return (await object.json()) as T;
	} catch {
		return null;
	}
}

export async function readBackfeedState(bucket: R2Bucket | undefined): Promise<BackfeedState | null> {
	if (!bucket) return null;
	const state = await readJson<BackfeedState>(bucket, STATE_KEY);
	return state && state.checked && typeof state.checked === 'object' ? state : null;
}

/** The posts with social copies, from the prerendered list. */
export async function backfeedTargets(env: BackfeedEnvironment, origin = 'https://caseyagollan.com', fetcher: Fetch = fetch): Promise<BackfeedTarget[]> {
	const url = new URL('/backfeed.json', origin).href;
	const response = env.ASSETS ? await env.ASSETS.fetch(new Request(url)) : await fetcher(url, { cache: 'no-store' });
	if (!response.ok) throw new Error(`backfeed.json returned ${response.status}`);
	const data = (await response.json()) as { posts?: unknown };
	return (Array.isArray(data.posts) ? data.posts : []).filter(
		(post): post is BackfeedTarget => !!post && typeof post.path === 'string' && typeof post.published === 'string' && Array.isArray(post.syndication)
	);
}

async function resolveDid(fetcher: Fetch): Promise<string | undefined> {
	const handle = ownAccounts().bluesky;
	if (!handle) return undefined;
	const { data } = await getJson(fetcher, `${BLUESKY_API}com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
	return typeof data?.did === 'string' ? data.did : undefined;
}

export interface BackfeedResult {
	skipped?: 'no-bucket';
	read: number;
	responses: number;
	failed: number;
	due: number;
}

/** Reads the posts most overdue for a refresh, a few per run, and stores what each has now. */
export async function syncBackfeed(env: BackfeedEnvironment, fetcher: Fetch = fetch, now = () => new Date(), limit = POSTS_PER_RUN): Promise<BackfeedResult> {
	const bucket = env.PUBLISHING_STATE;
	const result: BackfeedResult = { read: 0, responses: 0, failed: 0, due: 0 };
	if (!bucket) return { ...result, skipped: 'no-bucket' };
	const state: BackfeedState = (await readBackfeedState(bucket)) ?? { checked: {}, syncedAt: '' };
	state.did ??= await resolveDid(fetcher).catch(() => undefined);
	const targets = (await backfeedTargets(env, undefined, fetcher)).filter((target) => target.syndication.some((url) => socialCopy(url, state.did)));
	const time = now().getTime();
	const due = targets
		.map((target) => ({ target, overdue: time - (Date.parse(state.checked[target.path] ?? '') || 0) - refreshAfter(target.published, time) }))
		.filter(({ overdue }) => overdue >= 0)
		.sort((a, b) => b.overdue - a.overdue);
	result.due = due.length;

	const index = (await readJson<Record<string, IndexEntry[]>>(bucket, INDEX_KEY)) ?? {};
	for (const { target } of due.slice(0, limit)) {
		try {
			const responses = await readTarget(target, state.did, fetcher);
			await bucket.put(postKey(target.path), JSON.stringify(responses), json);
			if (responses.length) index[target.path] = responses.map(({ id, kind, author, source, url, html, text }) => ({ id, kind, author: { name: author.name, url: author.url, photo: '' }, source, url, ...(html || text ? { content: true } : {}) }));
			else delete index[target.path];
			result.read++;
			result.responses += responses.length;
		} catch {
			// Try again on a later run rather than straight away.
			result.failed++;
		}
		state.checked[target.path] = now().toISOString();
	}
	// Posts that are gone from the site stop being tracked.
	const live = new Set(targets.map((target) => target.path));
	for (const path of Object.keys(state.checked)) if (!live.has(path)) delete state.checked[path];
	state.syncedAt = now().toISOString();
	await bucket.put(INDEX_KEY, JSON.stringify(index), json);
	await bucket.put(STATE_KEY, JSON.stringify(state), json);
	return result;
}

function normalizeStored(value: unknown): StoredMention | null {
	if (!value || typeof value !== 'object') return null;
	const m = value as StoredMention;
	return Number.isSafeInteger(m.id) && typeof m.target === 'string' && typeof m.url === 'string' && m.author && typeof m.author === 'object' ? m : null;
}

/**
 * One post's Mastodon and Bluesky responses across its addresses. Until the bucket has been
 * read once, they are read live from the networks, for the post's current address only.
 */
export async function readBackfeed(env: BackfeedEnvironment, paths: string[], fetcher: Fetch = fetch): Promise<StoredMention[]> {
	const bucket = env.PUBLISHING_STATE;
	const state = await readBackfeedState(bucket);
	if (bucket && state) {
		const lists = await Promise.all(paths.map(async (path) => {
			const list = await readJson<unknown[]>(bucket, postKey(path));
			return Array.isArray(list) ? list.map(normalizeStored).filter((m): m is StoredMention => !!m) : [];
		}));
		return lists.flat();
	}
	try {
		const wanted = new Set(paths.map((path) => targetPath(path)));
		const targets = (await backfeedTargets(env, undefined, fetcher)).filter((target) => wanted.has(target.path));
		if (!targets.length) return [];
		const did = await resolveDid(fetcher).catch(() => undefined);
		return (await Promise.all(targets.map((target) => readTarget(target, did, fetcher)))).flat();
	} catch {
		return [];
	}
}

/** Per post, the stored responses' index entries, for count chips. Null before the first read. */
export async function readBackfeedIndex(bucket: R2Bucket | undefined): Promise<Record<string, IndexEntry[]> | null> {
	if (!bucket || !(await readBackfeedState(bucket))) return null;
	return (await readJson<Record<string, IndexEntry[]>>(bucket, INDEX_KEY)) ?? {};
}
