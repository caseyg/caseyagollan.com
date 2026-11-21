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
export interface AgentSearchDocument { u: string; t: string; y: string; d?: string; g?: string; x: string }

export interface SiteSearchResult { url: string; title: string; type: string; date?: string; tags?: string; excerpt: string; score: number }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#039': "'", nbsp: ' ' };
export const plainText = (html: string) =>
	html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&(#?\w+);/g, (match, name: string) => ENTITIES[name] ?? match).replace(/\s+/g, ' ').trim();

export function agentSearchDocument(url: string, title: string, type: string, metadata: Record<string, unknown>, html: string): AgentSearchDocument {
	const text = plainText(html);
	// The heading repeats the title; leave it out of the text.
	const body = text.startsWith(title) ? text.slice(title.length).trim() : text;
	const date = typeof metadata.date === 'string' && metadata.date ? metadata.date.slice(0, 10) : typeof metadata.year === 'string' && metadata.year ? String(metadata.year) : undefined;
	const tags = typeof metadata.tags === 'string' && metadata.tags ? metadata.tags : undefined;
	return { u: url, t: title, y: type, ...(date ? { d: date } : {}), ...(tags ? { g: tags } : {}), x: body.slice(0, TEXT_LIMIT) };
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
		results.push({ url: doc.u, title: doc.t, type: doc.y, ...(doc.d ? { date: doc.d } : {}), ...(doc.g ? { tags: doc.g } : {}), excerpt: excerpt(doc.x, terms), score });
	}
	return results.sort((a, b) => b.score - a.score || (b.date ?? '').localeCompare(a.date ?? '')).slice(0, Math.min(Math.max(options.limit ?? 8, 1), 20));
}

/** Text around the first matched word, about 240 characters. */
function excerpt(text: string, terms: string[]): string {
	const lower = text.toLowerCase();
	const at = Math.min(...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0), text.length);
	const start = Math.max(0, at - 80);
	const slice = text.slice(start, start + 240);
	return `${start > 0 ? '…' : ''}${slice}${start + 240 < text.length ? '…' : ''}`;
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
