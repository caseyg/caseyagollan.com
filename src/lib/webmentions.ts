/*
 * Webmentions the site keeps its own copy of. The cron copies them from webmention.io into the
 * publishing-state bucket (`$lib/server/webmentions`), pages read them from `/api/webmentions`,
 * and the owner can hide a mention, or everything from one person, without asking webmention.io.
 * Shared by the server and the browser, so nothing here touches the DOM or a binding.
 */

export type MentionKind = 'like' | 'repost' | 'reply' | 'mention' | 'bookmark';

export interface MentionAuthor {
	name: string;
	url: string;
	photo: string;
}

export interface StoredMention {
	/** webmention.io's `wm-id`; increases as mentions arrive. */
	id: number;
	kind: MentionKind;
	/** The post on this site it is about, as a path such as `/2025/09/29/slug/`. */
	target: string;
	/** Where the mention lives, such as the reply on Mastodon. */
	url: string;
	/** The page that sent it, which differs from `url` for Bridgy backfeed. */
	source: string;
	author: MentionAuthor;
	published?: string;
	received?: string;
	/** Markup as received. It is sanitized before it is sent to a page. */
	html?: string;
	text?: string;
	/**
	 * Set when the site read it straight from Mastodon or Bluesky (`$lib/server/backfeed`)
	 * rather than through webmention.io. Its `id` is then `nativeId(url)`.
	 */
	network?: 'mastodon' | 'bluesky';
	/** For a reply to another reply, the `url` of the one it answers. Top-level replies have none. */
	parent?: string;
}

export interface MentionModeration {
	/** Mention ids the owner hid. */
	hidden: number[];
	/** People whose mentions are all hidden, by `authorKey`. */
	blockedAuthors: string[];
}

export type ModerationAction =
	| { action: 'hide' | 'show'; id: number }
	| { action: 'block' | 'unblock'; author: string };

export interface MentionCounts {
	like: number;
	repost: number;
	reply: number;
}

const SITE_HOSTS = new Set(['caseyagollan.com', 'www.caseyagollan.com']);
const KIND: Record<string, MentionKind> = {
	'like-of': 'like',
	'repost-of': 'repost',
	'in-reply-to': 'reply',
	'mention-of': 'mention',
	'bookmark-of': 'bookmark'
};

export const emptyModeration = (): MentionModeration => ({ hidden: [], blockedAuthors: [] });

/** The path of a post on this site, or null for any other address. Old and odd forms meet here. */
export function targetPath(value: string): string | null {
	try {
		const url = new URL(value, 'https://caseyagollan.com');
		if (!SITE_HOSTS.has(url.hostname.toLowerCase())) return null;
		let path = decodeURI(url.pathname).replace(/\/{2,}/g, '/');
		if (!path.endsWith('/')) path += '/';
		return path;
	} catch {
		return null;
	}
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const httpUrl = (value: unknown): string => {
	const raw = text(value);
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
	} catch {
		return '';
	}
};

/** One webmention.io JF2 entry as the site stores it, or null when it is private or unusable. */
export function normalizeMention(raw: unknown): StoredMention | null {
	if (!raw || typeof raw !== 'object') return null;
	const entry = raw as Record<string, unknown>;
	const id = Number(entry['wm-id']);
	const kind = KIND[text(entry['wm-property'])];
	const target = targetPath(text(entry['wm-target']));
	if (!Number.isSafeInteger(id) || id <= 0 || !kind || !target || entry['wm-private'] === true) return null;
	const author = (entry.author && typeof entry.author === 'object' ? entry.author : {}) as Record<string, unknown>;
	const content = (entry.content && typeof entry.content === 'object' ? entry.content : {}) as Record<string, unknown>;
	const source = httpUrl(entry['wm-source']);
	const url = httpUrl(entry.url) || source;
	if (!url) return null;
	const mention: StoredMention = {
		id,
		kind,
		target,
		url,
		source: source || url,
		author: { name: text(author.name), url: httpUrl(author.url), photo: httpUrl(author.photo) }
	};
	const published = text(entry.published);
	const received = text(entry['wm-received']);
	if (published && !Number.isNaN(Date.parse(published))) mention.published = published;
	if (received && !Number.isNaN(Date.parse(received))) mention.received = received;
	const html = text(content.html);
	const plain = text(content.text) || text(content.value);
	if (html) mention.html = html;
	if (plain) mention.text = plain;
	return mention;
}

/** Identifies a person across their mentions: their profile address, or the sending site. */
export function authorKey(mention: Pick<StoredMention, 'author' | 'source'>): string {
	const raw = mention.author.url || mention.source;
	try {
		const url = new URL(raw);
		const path = url.pathname.replace(/\/+$/, '');
		return `${url.hostname.toLowerCase().replace(/^www\./, '')}${path}`;
	} catch {
		return raw.toLowerCase();
	}
}

/** A short name for a person, for the owner's menu. */
export function authorLabel(mention: Pick<StoredMention, 'author' | 'source'>): string {
	return mention.author.name || authorKey(mention);
}

export function isHidden(mention: StoredMention, moderation: MentionModeration): boolean {
	return moderation.hidden.includes(mention.id) || moderation.blockedAuthors.includes(authorKey(mention));
}

export function parseModeration(value: unknown): MentionModeration {
	if (!value || typeof value !== 'object') return emptyModeration();
	const raw = value as Record<string, unknown>;
	const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [];
	const blockedAuthors = Array.isArray(raw.blockedAuthors) ? raw.blockedAuthors.filter((key): key is string => typeof key === 'string' && key.length > 0 && key.length < 400) : [];
	return { hidden: [...new Set(hidden)], blockedAuthors: [...new Set(blockedAuthors)] };
}

export function parseModerationAction(value: unknown): ModerationAction | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if ((raw.action === 'hide' || raw.action === 'show') && Number.isSafeInteger(raw.id) && (raw.id as number) > 0) return { action: raw.action, id: raw.id as number };
	if ((raw.action === 'block' || raw.action === 'unblock') && typeof raw.author === 'string' && raw.author.length > 0 && raw.author.length < 400) return { action: raw.action, author: raw.author };
	return null;
}

export function applyModeration(moderation: MentionModeration, change: ModerationAction): MentionModeration {
	const without = <T>(list: T[], item: T) => list.filter((value) => value !== item);
	switch (change.action) {
		case 'hide':
			return { ...moderation, hidden: [...without(moderation.hidden, change.id), change.id] };
		case 'show':
			return { ...moderation, hidden: without(moderation.hidden, change.id) };
		case 'block':
			return { ...moderation, blockedAuthors: [...without(moderation.blockedAuthors, change.author), change.author] };
		case 'unblock':
			return { ...moderation, blockedAuthors: without(moderation.blockedAuthors, change.author) };
	}
}

/** Ids of mentions read from Mastodon or Bluesky start here, clear of webmention.io's own. */
export const NATIVE_ID_BASE = 2 ** 50;

/** A stable id for a mention read from Mastodon or Bluesky, from its address (FNV-1a, 50 bits). */
export function nativeId(url: string): number {
	let hash = 0xcbf29ce484222325n;
	for (const byte of new TextEncoder().encode(url)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
	return NATIVE_ID_BASE + Number(hash & (2n ** 50n - 1n));
}

/** One address for a reply however it was linked: Bluesky by record key, others without hash or trailing slash. */
export function replyKey(url: string): string {
	try {
		const parsed = new URL(url);
		const bluesky = parsed.hostname === 'bsky.app' && parsed.pathname.match(/^\/profile\/[^/]+\/post\/([^/]+)/);
		if (bluesky) return `bsky:${bluesky[1]}`;
		return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
	} catch {
		return url;
	}
}

/** What makes two copies of one response the same: a reply's address, or who liked or reposted. */
export function responseKey(mention: Pick<StoredMention, 'kind' | 'url' | 'author' | 'source'>): string {
	return mention.kind === 'like' || mention.kind === 'repost' ? `${mention.kind}|${authorKey(mention)}` : `post|${replyKey(mention.url)}`;
}

/**
 * Webmentions and the responses read from Mastodon and Bluesky, as one list. Bridgy sends
 * copies of the same responses as Webmentions; the direct copy wins, since it knows which reply
 * answers which, but keeps the Webmention's id so anything already hidden stays hidden.
 */
export function combineResponses<T extends StoredMention>(webmentions: T[], native: T[]): T[] {
	const copies = new Map(webmentions.map((mention) => [responseKey(mention), mention]));
	const used = new Set<T>();
	const direct = native.map((mention) => {
		const copy = copies.get(responseKey(mention));
		if (!copy || used.has(copy)) return mention;
		used.add(copy);
		return { ...mention, id: copy.id };
	});
	return [...webmentions.filter((mention) => !used.has(mention)), ...direct];
}

/** Adds new mentions to a list, replacing any with the same id, oldest first. */
export function mergeMentions(existing: StoredMention[], incoming: StoredMention[]): StoredMention[] {
	const byId = new Map(existing.map((mention) => [mention.id, mention]));
	for (const mention of incoming) byId.set(mention.id, mention);
	return [...byId.values()].sort((a, b) => a.id - b.id);
}

export interface MentionGroups<T extends StoredMention = StoredMention> {
	likes: T[];
	reposts: T[];
	/** Replies, and mentions that say something. */
	replies: T[];
	/** Pages that only link here. */
	links: T[];
}

const time = (mention: StoredMention) => {
	const value = Date.parse(mention.published ?? mention.received ?? '');
	return Number.isNaN(value) ? Infinity : value;
};

/** Oldest first, by when it was written; ids break ties and order undated ones. */
export const byTime = (a: StoredMention, b: StoredMention) => time(a) - time(b) || a.id - b.id;

export interface ReplyNode<T extends StoredMention = StoredMention> {
	reply: T;
	replies: ReplyNode<T>[];
}

/**
 * Replies nested under the reply each one answers, oldest first at every level, as Bluesky
 * shows a thread. A reply whose parent isn't in the list (hidden, deleted) moves to the top.
 */
export function threadReplies<T extends StoredMention>(replies: T[]): ReplyNode<T>[] {
	const nodes = new Map<string, ReplyNode<T>>();
	const sorted = replies.toSorted(byTime);
	for (const reply of sorted) nodes.set(replyKey(reply.url), { reply, replies: [] });
	const top: ReplyNode<T>[] = [];
	for (const reply of sorted) {
		const node = nodes.get(replyKey(reply.url))!;
		const parent = reply.parent ? nodes.get(replyKey(reply.parent)) : undefined;
		if (parent && parent !== node && !contains(node, parent)) parent.replies.push(node);
		else if (!top.includes(node)) top.push(node);
	}
	return top;
}

function contains<T extends StoredMention>(node: ReplyNode<T>, target: ReplyNode<T>): boolean {
	return node.replies.some((child) => child === target || contains(child, target));
}

export function groupMentions<T extends StoredMention>(mentions: T[]): MentionGroups<T> {
	const groups: MentionGroups<T> = { likes: [], reposts: [], replies: [], links: [] };
	for (const mention of mentions.toSorted(byTime)) {
		if (mention.kind === 'like') groups.likes.push(mention);
		else if (mention.kind === 'repost') groups.reposts.push(mention);
		else if (mention.kind === 'reply' || mention.html || mention.text) groups.replies.push(mention);
		else groups.links.push(mention);
	}
	return groups;
}

export function countMentions(mentions: StoredMention[]): MentionCounts {
	const { likes, reposts, replies, links } = groupMentions(mentions);
	return { like: likes.length, repost: reposts.length, reply: replies.length + links.length };
}
