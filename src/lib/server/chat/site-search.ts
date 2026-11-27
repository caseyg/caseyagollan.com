/**
 * The /chat agent's `search_site` tool. Pagefind's runtime can't run in a Worker (it
 * compiles WebAssembly at runtime), so the search build also writes the same documents,
 * as plain text, to `/pagefind/agent-index.json`, and this searches that file.
 * Imported by the build script (plain Bun) and the Worker, so it imports nothing.
 */

export const AGENT_INDEX_FILE = 'agent-index.json';
export const AGENT_INDEX_PATH = `/pagefind/${AGENT_INDEX_FILE}`;
/** Text kept per document: enough to judge a result, short enough to keep the file small. */
const TEXT_LIMIT = 700;

/** One searchable document: url, title, type, date and the start of its text. */
/** `k` is what kind of thing within its type, where that matters: an Are.na `channel` as against a block in one. */
export interface AgentSearchDocument { u: string; t: string; y: string; d?: string; g?: string; k?: string; x: string }

export interface SiteSearchResult { url: string; title: string; type: string; kind?: string; date?: string; tags?: string; excerpt: string; score: number }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#039': "'", nbsp: ' ' };
export const plainText = (html: string) =>
	html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&(#?\w+);/g, (match, name: string) => ENTITIES[name] ?? match).replace(/\s+/g, ' ').trim();

export function agentSearchDocument(url: string, title: string, type: string, metadata: Record<string, unknown>, html: string): AgentSearchDocument {
	const text = plainText(html);
	// The heading repeats the title; leave it out of the text.
	const body = text.startsWith(title) ? text.slice(title.length).trim() : text;
	const date = typeof metadata.date === 'string' && metadata.date ? metadata.date.slice(0, 10) : typeof metadata.year === 'string' && metadata.year ? String(metadata.year) : undefined;
	const tags = typeof metadata.tags === 'string' && metadata.tags ? metadata.tags : undefined;
	const kind = type === 'arena' && typeof metadata.kind === 'string' && metadata.kind ? metadata.kind.toLowerCase() : undefined;
	return { u: url, t: title, y: type, ...(date ? { d: date } : {}), ...(tags ? { g: tags } : {}), ...(kind ? { k: kind } : {}), x: body.slice(0, TEXT_LIMIT) };
}

const words = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];

/** Rank documents for a query: every word must appear; title and tag matches count most. */
export function searchDocuments(documents: AgentSearchDocument[], query: string, options: { type?: string; limit?: number } = {}): SiteSearchResult[] {
	const terms = [...new Set(words(query))].filter((term) => term.length > 1 || /\d/.test(term)).slice(0, 12);
	if (!terms.length) return [];
	const phrase = query.toLowerCase().trim();
	const results: SiteSearchResult[] = [];
	for (const doc of documents) {
		if (options.type && doc.y !== options.type) continue;
		const title = doc.t.toLowerCase(), tags = (doc.g ?? '').toLowerCase(), text = doc.x.toLowerCase();
		let score = 0, matched = 0;
		for (const term of terms) {
			const inTitle = title.includes(term), inTags = tags.includes(term), inText = text.includes(term);
			if (!inTitle && !inTags && !inText) continue;
			matched++;
			score += (inTitle ? 6 : 0) + (inTags ? 3 : 0) + (inText ? 1 + Math.min(text.split(term).length - 2, 4) * 0.25 : 0);
		}
		// Most words must match; on short queries, all of them.
		if (matched < Math.max(1, terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6))) continue;
		if (terms.length > 1 && (title.includes(phrase) || text.includes(phrase))) score += 8;
		score *= matched / terms.length;
		results.push({ url: doc.u, title: doc.t, type: doc.y, ...(doc.k ? { kind: doc.k } : {}), ...(doc.d ? { date: doc.d } : {}), ...(doc.g ? { tags: doc.g } : {}), excerpt: excerpt(doc.x, terms), score });
	}
	return results.sort((a, b) => b.score - a.score || (b.date ?? '').localeCompare(a.date ?? '')).slice(0, Math.min(Math.max(options.limit ?? 8, 1), 20));
}

/** Casey's own posts, as against what Casey liked, reposted or saved from elsewhere. */
export const OWN_TYPES = ['note', 'article', 'photo', 'video', 'reply', 'bookmark'];
/** Every kind of thing in the index, plus `post` for all of Casey's own posts. */
export const SEARCH_TYPES = ['post', ...OWN_TYPES, 'like', 'repost', 'book', 'wiki', 'arena'] as const;

export interface FindOptions {
	/** Words to look for. Without any, items are listed newest first. */
	query?: string;
	/** One kind, or `post` for Casey's own posts of every kind. */
	type?: string;
	/** Only items tagged with this. */
	tag?: string;
	/** Dates as YYYY-MM-DD, inclusive. Only dated items (posts and Are.na) can match. */
	since?: string;
	until?: string;
	limit?: number;
}

export interface FoundItem { url: string; title: string; type: string; kind?: string; date?: string; tags?: string; text: string }

export interface Found {
	/** How many matched in all, and how many of each kind, so a count needs no second call. */
	total: number;
	by_type: Record<string, number>;
	results: FoundItem[];
	/** What the reader should know about the results: an empty range, where Casey's last own post was. */
	note?: string;
}

/** How much of an item's text a result carries: enough of Casey's own words to answer from; a line of anything else. */
const OWN_TEXT = 500, OTHER_TEXT = 200, MATCH_TEXT = 280;
const cut = (text: string, limit: number) => text.length <= limit ? text : `${text.slice(0, limit).replace(/\s+\S*$/, '')}…`;
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The local calendar date in a time zone, as YYYY-MM-DD. */
export function localDate(at: Date, timeZone = 'America/New_York'): string {
	const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at).map((part) => [part.type, part.value]));
	return `${parts.year}-${parts.month}-${parts.day}`;
}

/** A date some days before another, both YYYY-MM-DD. */
export function daysBefore(date: string, days: number): string {
	return new Date(Date.parse(`${date}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * One call for finding and for browsing. With words, the best matches (within the dates, kind
 * and tag asked for). Without, everything in that range newest first, Casey's own posts ahead
 * of likes and reposts, since "what's new" means those first. Either way the answer says how
 * many matched and of what kinds, and each result carries its text, so most questions end here.
 */
export function findDocuments(documents: AgentSearchDocument[], options: FindOptions = {}): Found {
	const query = (options.query ?? '').trim().slice(0, 200);
	const type = options.type?.trim().toLowerCase().replace(/ies$/, 'y').replace(/s$/, '') || undefined;
	const types = !type || type === 'all' || type === 'any' ? undefined : type === 'post' ? OWN_TYPES : [type];
	const tag = options.tag?.trim().toLowerCase().replace(/^#/, '');
	const since = isDate(options.since) ? options.since : undefined, until = isDate(options.until) ? options.until : undefined;
	const limit = Math.min(Math.max(Math.round(options.limit ?? (query ? 8 : 15)) || 8, 1), 30);
	const within = (doc: AgentSearchDocument) =>
		(!types || types.includes(doc.y))
		&& (!tag || (doc.g ?? '').toLowerCase().split(/,\s*/).includes(tag))
		&& ((!since && !until) || (isDate(doc.d) && (!since || doc.d >= since) && (!until || doc.d <= until)));
	const pool = documents.filter(within);
	const by_type: Record<string, number> = {};
	const item = (doc: AgentSearchDocument, text: string): FoundItem => ({ url: doc.u, title: doc.t, type: doc.y, ...(doc.k ? { kind: doc.k } : {}), ...(doc.d ? { date: doc.d } : {}), ...(doc.g ? { tags: doc.g } : {}), text });
	let results: FoundItem[];
	let total: number;
	if (query) {
		// The ranked search stops at twenty; count every match so the total is true.
		total = countMatches(pool, query, by_type);
		results = searchDocuments(pool, query, { limit }).map(({ score: _score, excerpt, ...rest }) => ({ ...rest, text: excerpt }));
	} else {
		for (const doc of pool) by_type[doc.y] = (by_type[doc.y] ?? 0) + 1;
		total = pool.length;
		const own = (doc: AgentSearchDocument) => OWN_TYPES.includes(doc.y) ? 0 : 1;
		const newest = pool.toSorted((a, b) => (types?.length === 1 ? 0 : own(a) - own(b)) || (b.d ?? '').localeCompare(a.d ?? ''));
		results = newest.slice(0, limit).map((doc) => item(doc, cut(doc.x, OWN_TYPES.includes(doc.y) ? OWN_TEXT : OTHER_TEXT)));
	}
	const notes: string[] = [];
	if (total > results.length) notes.push(`Showing ${results.length} of ${total}${query ? ', best matches first' : types?.length === 1 ? ', newest first' : ', Casey’s own posts first, then newest first'}. For the rest of one kind, ask again with that type; otherwise this is the answer.`);
	else if (total && !types) notes.push('This is everything that matched, of every kind: searching again by type or in other words won’t find more.');
	if (!total) notes.push(query ? 'Nothing matched. Try fewer or different words; every word must appear.' : 'Nothing in that range.');
	// A quiet week of likes still has an answer to “what’s new”: when Casey last posted.
	if (since && !pool.some((doc) => OWN_TYPES.includes(doc.y)) && (!types || types.some((one) => OWN_TYPES.includes(one)))) {
		const last = documents.filter((doc) => OWN_TYPES.includes(doc.y) && isDate(doc.d) && doc.d < since && (!types || types.includes(doc.y))).sort((a, b) => b.d!.localeCompare(a.d!)).slice(0, 2);
		if (last.length) notes.push(`None of Casey’s own posts fall in these dates. The latest before them: ${last.map((doc) => `${doc.y} ${doc.d} ${doc.u} “${cut(doc.x, 120)}”`).join('; ')}`);
	}
	return { total, by_type, results, ...(notes.length ? { note: notes.join(' ') } : {}) };
}

/** Every document a query matches, counted by kind (the ranked search stops at twenty). */
function countMatches(documents: AgentSearchDocument[], query: string, by_type: Record<string, number>): number {
	const terms = [...new Set(words(query))].filter((term) => term.length > 1 || /\d/.test(term)).slice(0, 12);
	if (!terms.length) return 0;
	const need = Math.max(1, terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6));
	let total = 0;
	for (const doc of documents) {
		const hay = `${doc.t} ${doc.g ?? ''} ${doc.x}`.toLowerCase();
		if (terms.filter((term) => hay.includes(term)).length < need) continue;
		by_type[doc.y] = (by_type[doc.y] ?? 0) + 1;
		total++;
	}
	return total;
}

/** Text around the first matched word. */
function excerpt(text: string, terms: string[]): string {
	const lower = text.toLowerCase();
	const at = Math.min(...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0), text.length);
	const start = Math.max(0, at - 80);
	const slice = text.slice(start, start + MATCH_TEXT);
	return `${start > 0 ? '…' : ''}${slice}${start + MATCH_TEXT < text.length ? '…' : ''}`;
}

let cached: { at: number; documents: AgentSearchDocument[] } | undefined;

/** Load the index once per isolate (for ten minutes) from the site's own assets. */
export async function loadAgentIndex(assets: Pick<Fetcher, 'fetch'> | undefined, origin: string, now = Date.now()): Promise<AgentSearchDocument[]> {
	if (cached && now - cached.at < 600_000) return cached.documents;
	const request = new Request(new URL(AGENT_INDEX_PATH, origin));
	const response = assets ? await assets.fetch(request) : await fetch(request);
	if (!response.ok) throw new Error(`The search index answered ${response.status}`);
	const documents = await response.json() as AgentSearchDocument[];
	cached = { at: now, documents };
	return documents;
}
