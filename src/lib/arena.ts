/**
 * Casey's Are.na (user `casey-gollan`, v3 API). Shared by the build, which puts the public channels
 * and blocks in the site search index (`utils/arena.ts`), and the Worker, which searches the private
 * ones for the signed-in owner only (`$lib/server/arena.ts`, with the `ARENA_PAT` secret).
 */
export const ARENA_USER = 'casey-gollan';
export const ARENA_PROFILE = `https://www.are.na/${ARENA_USER}`;

const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const API = 'https://api.are.na/v3';
const PER_PAGE = 100;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface Text {
	markdown?: string | null;
	html?: string | null;
	plain?: string | null;
}

/** The fields this reads from an item of `/users/:slug/contents`. */
export interface ArenaItem {
	id: number;
	type: 'Channel' | 'Text' | 'Image' | 'Link' | 'Attachment' | 'Embed' | string;
	created_at?: string;
	updated_at?: string;
	visibility?: string;
	state?: string;
	slug?: string;
	title?: string | null;
	description?: Text | null;
	content?: Text | null;
	source?: { url?: string | null; title?: string | null; provider?: { name?: string | null } | null } | null;
	image?: { alt_text?: string | null; small?: { src?: string | null } | null; src?: string | null } | null;
	attachment?: { filename?: string | null } | null;
	embed?: { title?: string | null; author_name?: string | null } | null;
	counts?: { contents?: number } | null;
	user?: { slug?: string } | null;
	owner?: { slug?: string } | null;
}

/** One search document: what `build-search.ts` hands Pagefind. */
export interface ArenaDocument {
	url: string;
	title: string;
	/** `channel`, or the block's type in lower case: `image`, `link`, `text`, `attachment`, `embed`. */
	kind: string;
	/** A short line for the result: a channel's size, a link's site. */
	detail: string;
	date: string;
	image?: string;
	imageAlt?: string;
	html: string;
	/** The same words as plain text, for the Worker's own search of private blocks. */
	text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
/** Are.na's plain text still carries a few HTML entities; the index escapes text itself. */
const decode = (value: string) => value.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) => ENTITIES[name]);
const plain = (text?: Text | null) => decode(text?.plain?.trim() || text?.markdown?.trim() || '');
const clip = (value: string, max = 90) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** Everything Casey made, a page at a time, waiting out the rate limit when it is reached. */
export async function fetchArena(
	{ fetcher = fetch as Fetcher, token, user = ARENA_USER, attempts = 4, retryDelayMs = 2_000 }: { fetcher?: Fetcher; token?: string; user?: string; attempts?: number; retryDelayMs?: number } = {}
): Promise<ArenaItem[]> {
	const headers: Record<string, string> = { accept: 'application/json' };
	if (token) headers.authorization = `Bearer ${token}`;
	async function page(n: number): Promise<{ data: ArenaItem[]; meta: { has_more_pages?: boolean } }> {
		const url = `${API}/users/${encodeURIComponent(user)}/contents?per=${PER_PAGE}&page=${n}`;
		let failure = new Error(`Are.na: nothing fetched from ${url}`);
		for (let attempt = 1; attempt <= attempts; attempt++) {
			let wait = retryDelayMs * attempt;
			let response: Response;
			try {
				response = await fetcher(url, { headers, signal: AbortSignal.timeout(30_000) });
			} catch (error) {
				response = undefined as never;
				failure = new Error(`Are.na: ${error instanceof Error ? error.message : error} fetching ${url}`, { cause: error });
			}
			if (response) {
				if (response.ok) return (await response.json()) as never;
				failure = new Error(`Are.na: ${response.status} fetching ${url}`);
				// Anything but a rate limit or a server error won't get better by asking again.
				if (response.status !== 429 && response.status < 500) throw failure;
				if (response.status === 429) {
					// The reset header is a Unix time; wait for it, but no longer than one window.
					const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
					wait = Math.min(Math.max(reset || 0, retryDelayMs), 65_000);
				}
			}
			if (attempt < attempts) {
				console.warn(`${failure.message}; retrying (${attempt}/${attempts - 1})`);
				await new Promise((resolve) => setTimeout(resolve, wait));
			}
		}
		throw failure;
	}
	const items: ArenaItem[] = [];
	for (let n = 1; ; n++) {
		const { data, meta } = await page(n);
		items.push(...data);
		if (!meta?.has_more_pages || !data.length) return items;
	}
}

/** Casey made it (not a group or a collaborator) and it is finished processing. */
export function isOwn(item: ArenaItem, user = ARENA_USER): boolean {
	const author = item.type === 'Channel' ? item.owner?.slug : item.user?.slug;
	return (!item.state || item.state === 'available') && (!author || author === user);
}

/** Anyone can see it on Are.na: open and closed channels, and blocks not marked private. */
export const isVisible = (item: ArenaItem) => item.visibility === 'public' || item.visibility === 'closed';

/** Casey's own items that anyone can see, which is all the public search index may hold. */
export const isPublicOwn = (item: ArenaItem, user = ARENA_USER) => isOwn(item, user) && isVisible(item);

export function arenaDocument(item: ArenaItem): ArenaDocument {
	const date = item.created_at ?? item.updated_at ?? '';
	if (item.type === 'Channel') {
		const count = item.counts?.contents ?? 0;
		const description = plain(item.description);
		return {
			url: `${ARENA_PROFILE}/${item.slug ?? item.id}`,
			title: item.title?.trim() || item.slug || 'Untitled channel',
			kind: 'channel',
			detail: `Channel · ${count} ${count === 1 ? 'block' : 'blocks'}`,
			date: item.updated_at ?? date,
			html: `<h1>${escape(item.title ?? '')}</h1>${description ? `<p>${escape(description)}</p>` : ''}`,
			text: description
		};
	}
	const content = plain(item.content);
	const description = plain(item.description);
	const source = item.source?.url ?? '';
	const site = item.source?.provider?.name?.replace(/^www\./, '') ?? '';
	const title =
		item.title?.trim() || item.source?.title?.trim() || item.embed?.title?.trim() || (content && clip(content.replace(/\s+/g, ' '))) || item.attachment?.filename || site || 'Untitled block';
	const image = item.image?.small?.src || item.image?.src || undefined;
	const text = [content, description, item.embed?.author_name, item.source?.title, source].filter(Boolean) as string[];
	return {
		url: `https://www.are.na/block/${item.id}`,
		title,
		kind: item.type.toLowerCase(),
		detail: site ? `${item.type} · ${site}` : item.type,
		date,
		image,
		imageAlt: item.image?.alt_text ?? '',
		html: `<h1>${escape(title)}</h1>${text.map((line) => `<p>${escape(line)}</p>`).join('')}`,
		text: text.join(' ')
	};
}
