/**
 * Everything Casey has saved elsewhere, read in full for Casey's own chat: Are.na channels and their
 * blocks, Raindrop collections and their bookmarks, Readwise (Reader's shelves and tags, and the
 * books and articles Casey highlighted). Site search only finds what matches some words; this
 * lists what a channel, collection or book holds, a page at a time, and reads one item whole.
 *
 * Owner-only: it reads with the Worker secrets `ARENA_PAT`, `RAINDROP_TOKEN` and
 * `READWISE_ACCESS_TOKEN`, so private items come back too. Nothing here is cached in or copied to
 * anything public; callers must only hand results to the signed-in owner.
 */
import { ARENA_USER, arenaDocument, isVisible, type ArenaDocument, type ArenaItem } from '$lib/arena';
import { ARENA_ICON, type Block } from '$lib/tables';
import { privateArena, privateBlock, searchArena, type ArenaEnv } from './arena';
import { raindropBlock, type Raindrop } from './raindrop';

export const SAVE_SOURCES = ['arena', 'raindrop', 'readwise'] as const;
export type SaveSource = (typeof SAVE_SOURCES)[number];
export const SOURCE_NAME: Record<SaveSource, string> = { arena: 'Are.na', raindrop: 'Raindrop', readwise: 'Readwise' };

export interface SavesEnv extends ArenaEnv {
	RAINDROP_TOKEN?: string;
	READWISE_ACCESS_TOKEN?: string;
}

export interface SavesDeps {
	env: SavesEnv;
	fetcher?: typeof fetch;
	/** Casey's public Are.na from the site's own search index, for a search of all of Are.na. */
	publicArena?: (query: string, limit: number) => Promise<SavedItem[]>;
	waitUntil?: (promise: Promise<unknown>) => void;
}

/** Somewhere saved things are kept: an Are.na channel, a Raindrop collection, a Readwise shelf, tag or book. */
export interface SavedPlace {
	/** What to give as `in` to list it. */
	in: string;
	title: string;
	count?: number;
	kind?: string;
	url?: string;
	private?: boolean;
	updated?: string;
}

/** One saved thing, with the block it makes on a table. */
export interface SavedItem {
	id: string;
	title: string;
	url: string;
	kind: string;
	date?: string;
	text?: string;
	image?: string;
	private?: boolean;
	block: Block | null;
}

export interface SavedPage {
	place?: SavedPlace;
	items: SavedItem[];
	/** How many the place holds (or matched), when the source says. */
	total?: number;
	/** What to give as `after` for the next page; absent on the last. */
	more?: string;
}

export interface ListOptions {
	/** A channel, collection, shelf, tag or book: its title, id or address. */
	in?: string;
	query?: string;
	after?: string;
	/** Items per page. */
	per?: number;
}

/** A plain mistake in what was asked (no such channel, no token), worded for the model to act on. */
export class SavesError extends Error {}

const PAGE = 40;
const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`);
const flat = (value: unknown) => (typeof value === 'string' ? value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '');
const day = (value: unknown) => (typeof value === 'string' && value ? value.slice(0, 10) : undefined);
const norm = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const pageNumber = (after: string | undefined, first: number) => (after && /^\d+$/.test(after) ? Number(after) : first);

/** Are.na asks every client to say what it is and where to reach it. */
const USER_AGENT = 'caseyagollan.com/1.0 (+https://caseyagollan.com/)';
/** The longest `Retry-After`, in seconds, worth waiting out inside one answer. */
const RETRY_WITHIN = 4;

async function getJson<T>(deps: SavesDeps, name: string, url: string, init: RequestInit = {}): Promise<T> {
	const ask = () => (deps.fetcher ?? fetch)(url, { ...init, headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(20_000) });
	let response = await ask();
	// A service that says how soon to come back is asked once more, when that is soon.
	const wait = response.status === 429 ? Number(response.headers.get('retry-after')) : NaN;
	if (wait >= 0 && wait <= RETRY_WITHIN) {
		await new Promise((resolve) => setTimeout(resolve, wait * 1000));
		response = await ask();
	}
	if (response.status === 404) throw new SavesError(`${name} has nothing at that address.`);
	if (response.status === 401 || response.status === 403) throw new SavesError(`${name} refused: that is private, or the site’s ${name} token has stopped working.`);
	if (response.status === 429) throw new SavesError(`${name} is rate-limiting the site right now. Wait a minute before asking it again.`);
	if (!response.ok) throw new Error(`${name}: ${response.status}`);
	return (await response.json()) as T;
}

/**
 * The one of `places` that `wanted` names: by its `in`, its exact title, or the only title holding
 * every word. Anything less certain is an error that lists the closest, so the model asks again
 * rather than reading the wrong channel.
 */
export function pickPlace(places: SavedPlace[], wanted: string, what: string): SavedPlace {
	const key = norm(wanted);
	const exact = places.filter((place) => place.in.toLowerCase() === wanted.trim().toLowerCase() || norm(place.title) === key);
	if (exact.length) return exact[0];
	const words = key.split(' ').filter(Boolean);
	const close = places.filter((place) => words.every((word) => norm(place.title).includes(word)));
	if (close.length === 1) return close[0];
	const near = close.length ? close : places.filter((place) => words.some((word) => word.length > 2 && norm(place.title).includes(word)));
	throw new SavesError(
		near.length
			? `${close.length ? 'Several' : 'No'} ${what}s match “${wanted}”${close.length ? '' : ' exactly'}. Closest: ${near.slice(0, 10).map((place) => `“${place.title}” (in: ${place.in})`).join(', ')}. Give one of those as \`in\`.`
			: `No ${what} matches “${wanted}”. Call my_saves with only \`source\` to list them.`
	);
}

/** Every word of `query` in the item's title or text. */
function matches(item: SavedItem, query: string): boolean {
	const all = norm(`${item.title} ${item.text ?? ''} ${item.url}`);
	return norm(query).split(' ').filter(Boolean).every((word) => all.includes(word));
}

// ---------------------------------------------------------------- Are.na

const ARENA = 'https://api.are.na/v3';
type ArenaPage = { data: ArenaItem[]; meta: { total_count?: number; has_more_pages?: boolean; next_page?: number | null } };
type ArenaChannel = ArenaItem & { counts?: { contents?: number } | null };

const arenaGet = <T>(deps: SavesDeps, path: string) => getJson<T>(deps, 'Are.na', `${ARENA}${path}`, deps.env.ARENA_PAT ? { headers: { authorization: `Bearer ${deps.env.ARENA_PAT}` } } : {});

/** Where a channel lives on Are.na: under its owner, who isn't always Casey. */
const channelUrl = (item: ArenaItem) => `https://www.are.na/${item.owner?.slug ?? ARENA_USER}/${item.slug ?? item.id}`;

function arenaPlace(channel: ArenaChannel): SavedPlace {
	return {
		in: channel.slug ?? String(channel.id), title: channel.title?.trim() || channel.slug || 'Untitled channel', count: channel.counts?.contents ?? undefined, kind: 'channel',
		url: channelUrl(channel), updated: day(channel.updated_at), ...(channel.visibility === 'private' ? { private: true } : {})
	};
}

/** An Are.na document as a saved item; private ones make a block marked private, since tables are public. */
function arenaSaved(document: ArenaDocument, hidden: boolean): SavedItem {
	const excerpt = flat(document.text).slice(0, 300) || undefined;
	return {
		id: document.kind === 'channel' ? document.url.split('/').pop()! : document.url.replace(/^.*\/block\//, ''),
		title: document.title, url: document.url, kind: document.kind, date: day(document.date), text: flat(document.text) || undefined, image: document.image,
		...(hidden ? { private: true } : {}),
		block: hidden ? privateBlock(document) : { kind: 'arena', url: document.url, title: document.title, meta: document.detail, excerpt, image: document.image, icon: ARENA_ICON[document.kind] }
	};
}

function arenaItem(item: ArenaItem): SavedItem {
	const document = arenaDocument(item);
	if (item.type === 'Channel') document.url = channelUrl(item);
	return arenaSaved(document, item.visibility === 'private' || (item.visibility !== undefined && !isVisible(item)));
}

/** Casey's channels, newest first; private ones too when the token is set. */
export async function arenaChannels(deps: SavesDeps): Promise<SavedPlace[]> {
	const places: SavedPlace[] = [];
	for (let page = 1; page <= 5; page++) {
		const { data, meta } = await arenaGet<ArenaPage>(deps, `/users/${ARENA_USER}/contents?type=Channel&sort=updated_at_desc&per=100&page=${page}`);
		places.push(...data.filter((item) => item.type === 'Channel').map(arenaPlace));
		if (!meta?.has_more_pages || !data.length) break;
	}
	return places;
}

/** The channel `wanted` names: an are.na address, a slug, or one of Casey's channels by title. */
async function arenaChannel(deps: SavesDeps, wanted: string): Promise<SavedPlace> {
	const raw = wanted.trim();
	const address = /are\.na\/[^/\s]+\/([^/?#\s]+)/i.exec(raw)?.[1];
	if (address) return arenaPlace(await arenaGet<ArenaChannel>(deps, `/channels/${encodeURIComponent(address)}`));
	// A bare word is one of Casey's channels, never whoever on Are.na owns that slug.
	if (/^[a-z0-9][a-z0-9_-]*$/.test(raw)) {
		const channel = await arenaGet<ArenaChannel>(deps, `/channels/${encodeURIComponent(raw)}`).catch((error) => {
			if (!(error instanceof SavesError)) throw error;
			return null;
		});
		if (channel && channel.owner?.slug === ARENA_USER) return arenaPlace(channel);
	}
	return pickPlace(await arenaChannels(deps), raw, 'channel');
}

async function arenaList(deps: SavesDeps, options: ListOptions): Promise<SavedPage> {
	const per = options.per ?? PAGE;
	const query = options.query?.trim();
	if (!options.in) {
		if (!query) throw new SavesError('Give `in` (a channel) or `query`.');
		// All of Casey's Are.na: what anyone can see comes from the site's index, the rest from the private copy.
		const [open, hidden] = await Promise.all([
			deps.publicArena?.(query, per) ?? [],
			deps.env.ARENA_PAT ? privateArena(deps.env, deps.waitUntil, deps.fetcher).then((documents) => searchArena(documents, query, per).map((document) => arenaSaved(document, true))) : []
		]);
		const items = [...open, ...hidden].slice(0, per);
		return { items, total: items.length };
	}
	const place = await arenaChannel(deps, options.in);
	const contents = (page: number, size: number) => arenaGet<ArenaPage>(deps, `/channels/${encodeURIComponent(place.in)}/contents?sort=position_desc&per=${size}&page=${page}`);
	if (query) {
		// Are.na's own search is for paying members; a channel is small enough to read and filter here.
		const items: SavedItem[] = [];
		for (let page = 1; page <= 10; page++) {
			const { data, meta } = await contents(page, 100);
			items.push(...data.map(arenaItem).filter((item) => matches(item, query)));
			if (!meta?.has_more_pages || !data.length) break;
		}
		return { place, items: items.slice(0, per), total: items.length };
	}
	const page = pageNumber(options.after, 1);
	const { data, meta } = await contents(page, per);
	return { place, items: data.map(arenaItem), total: meta?.total_count ?? place.count, ...(meta?.has_more_pages && data.length ? { more: String(page + 1) } : {}) };
}

async function arenaRead(deps: SavesDeps, wanted: string): Promise<Record<string, unknown>> {
	const id = /(\d+)\s*$/.exec(wanted.trim().replace(/[?#].*$/, ''))?.[1];
	if (!id) throw new SavesError('Give the block’s id or its are.na/block/… address. To list a channel, use `in`.');
	const block = await arenaGet<ArenaItem & { content?: { plain?: string | null; markdown?: string | null } | null; description?: { plain?: string | null } | null }>(deps, `/blocks/${id}`);
	const item = arenaItem(block);
	const channels = await arenaGet<ArenaPage>(deps, `/blocks/${id}/connections?sort=created_at_desc&per=30`).then((page) => page.data.map((channel) => ({ title: channel.title, in: channel.slug, url: channelUrl(channel) }))).catch(() => []);
	const content = flat(block.content?.markdown ?? block.content?.plain ?? '');
	return {
		id: item.id, title: item.title, kind: item.kind, url: item.url, date: item.date, ...(item.private ? { private: true } : {}),
		...(block.source?.url ? { source: block.source.url } : {}), ...(block.image?.src ? { image: block.image.src } : {}),
		...(content ? { content: clip(content, 6000) } : {}), ...(flat(block.description?.plain) ? { description: clip(flat(block.description?.plain), 2000) } : {}),
		added_by: block.user?.slug, channels
	};
}

/**
 * What an Are.na block stands for, for rendering it: an attachment's own file (a PDF block's page on
 * are.na is only a viewer), or the page a link block saved.
 */
export async function arenaFile(deps: SavesDeps, wanted: string): Promise<{ title: string; file?: string; type?: string; source?: string }> {
	const id = /(\d+)\s*$/.exec(wanted.trim().replace(/[?#].*$/, ''))?.[1];
	if (!id) throw new SavesError('That isn’t an Are.na block.');
	const block = await arenaGet<ArenaItem & { attachment?: { url?: string | null; content_type?: string | null } | null }>(deps, `/blocks/${id}`);
	return {
		title: arenaItem(block).title,
		...(block.attachment?.url ? { file: block.attachment.url, type: block.attachment.content_type ?? undefined } : {}),
		...(block.type === 'Link' && block.source?.url ? { source: block.source.url } : {})
	};
}

// ---------------------------------------------------------------- Raindrop

const RAINDROP = 'https://api.raindrop.io/rest/v1';
interface RaindropCollection { _id: number; title?: string; count?: number; parent?: { $id?: number } | null }
type RaindropFull = Raindrop & { highlights?: { text?: string; note?: string }[] | null; collection?: { $id?: number } | null };

function raindropGet<T>(deps: SavesDeps, path: string): Promise<T> {
	if (!deps.env.RAINDROP_TOKEN) throw new SavesError('Raindrop isn’t connected here (the site has no RAINDROP_TOKEN).');
	return getJson<T>(deps, 'Raindrop', `${RAINDROP}${path}`, { headers: { authorization: `Bearer ${deps.env.RAINDROP_TOKEN}` } });
}

/** Casey's collections, nested ones named with their parent, then the two Raindrop keeps itself. */
export async function raindropCollections(deps: SavesDeps): Promise<SavedPlace[]> {
	const [roots, children] = await Promise.all([raindropGet<{ items?: RaindropCollection[] }>(deps, '/collections'), raindropGet<{ items?: RaindropCollection[] }>(deps, '/collections/childrens')]);
	const all = [...(roots.items ?? []), ...(children.items ?? [])];
	const byId = new Map(all.map((collection) => [collection._id, collection]));
	const name = (collection: RaindropCollection): string => {
		const parent = collection.parent?.$id ? byId.get(collection.parent.$id) : undefined;
		return parent ? `${name(parent)} / ${collection.title ?? ''}` : (collection.title ?? 'Untitled');
	};
	return [
		...all.map((collection) => ({ in: String(collection._id), title: name(collection), count: collection.count, kind: 'collection' })).sort((a, b) => a.title.localeCompare(b.title)),
		{ in: 'unsorted', title: 'Unsorted', kind: 'collection' },
		{ in: 'all', title: 'All bookmarks', kind: 'collection' }
	];
}

function raindropItem(item: RaindropFull): SavedItem | null {
	const block = raindropBlock(item);
	if (!block) return null;
	const text = [item.excerpt, item.note, item.tags?.length ? `Tags: ${item.tags.join(', ')}` : ''].map(flat).filter(Boolean).join(' · ');
	return { id: String(item._id), title: block.title, url: block.url, kind: item.type ?? 'link', date: day(item.created), text: text || undefined, image: block.image, block };
}

async function raindropList(deps: SavesDeps, options: ListOptions): Promise<SavedPage> {
	const per = Math.min(options.per ?? PAGE, 50);
	const query = options.query?.trim();
	if (!options.in && !query) throw new SavesError('Give `in` (a collection) or `query`.');
	const wanted = options.in?.trim().toLowerCase();
	const place = !wanted || wanted === 'all' ? { in: 'all', title: 'All bookmarks', kind: 'collection' }
		: wanted === 'unsorted' ? { in: 'unsorted', title: 'Unsorted', kind: 'collection' }
		: pickPlace(await raindropCollections(deps), options.in!, 'collection');
	const id = place.in === 'all' ? '0' : place.in === 'unsorted' ? '-1' : place.in;
	const page = pageNumber(options.after, 0);
	const params = new URLSearchParams({ perpage: String(per), page: String(page), sort: query ? 'score' : '-created' });
	if (query) params.set('search', query);
	const data = await raindropGet<{ items?: RaindropFull[]; count?: number }>(deps, `/raindrops/${id}?${params}`);
	const items = (data.items ?? []).map(raindropItem).filter((item) => item !== null);
	const total = data.count ?? place.count;
	return { place: { ...place, count: total }, items, total, ...((data.items?.length ?? 0) === per && (total === undefined || (page + 1) * per < total) ? { more: String(page + 1) } : {}) };
}

async function raindropRead(deps: SavesDeps, wanted: string): Promise<Record<string, unknown>> {
	if (!/^\d+$/.test(wanted.trim())) throw new SavesError('Give the bookmark’s id, as a list gave it. To read the page it points to, use fetch_page with its url.');
	const { item } = await raindropGet<{ item?: RaindropFull }>(deps, `/raindrop/${wanted.trim()}`);
	if (!item) throw new SavesError('Raindrop has no bookmark with that id.');
	return {
		id: String(item._id), title: item.title, url: item.link, kind: item.type, date: day(item.created), tags: item.tags ?? [],
		...(flat(item.excerpt) ? { excerpt: clip(flat(item.excerpt), 2000) } : {}), ...(flat(item.note) ? { note: clip(flat(item.note), 4000) } : {}),
		highlights: (item.highlights ?? []).map((highlight) => ({ text: clip(flat(highlight.text), 1000), ...(flat(highlight.note) ? { note: flat(highlight.note) } : {}) })).slice(0, 40)
	};
}

// ---------------------------------------------------------------- Readwise

const READWISE = 'https://readwise.io/api';
/** Reader's shelves, by the names its interface uses, and the API's name for each. */
const SHELVES: Record<string, string> = { inbox: 'new', later: 'later', shortlist: 'shortlist', archive: 'archive', feed: 'feed' };
const HIGHLIGHT_KINDS = ['books', 'articles', 'tweets', 'podcasts', 'supplementals'];

interface ReaderDocument { id: string; url?: string; source_url?: string | null; title?: string | null; author?: string | null; category?: string; location?: string | null; summary?: string | null; saved_at?: string; created_at?: string; image_url?: string | null; site_name?: string | null; parent_id?: string | null; word_count?: number | null; reading_progress?: number | null; html_content?: string | null; notes?: string | null; tags?: Record<string, unknown> | null }
interface ReadwiseBook { id: number; title?: string; author?: string | null; category?: string; num_highlights?: number; last_highlight_at?: string | null; cover_image_url?: string | null; source_url?: string | null; highlights_url?: string | null }
interface ReadwiseHighlight { id: number; text?: string; note?: string | null; highlighted_at?: string | null; url?: string | null; readwise_url?: string | null; book_id?: number }

function readwiseGet<T>(deps: SavesDeps, path: string, init: RequestInit = {}): Promise<T> {
	if (!deps.env.READWISE_ACCESS_TOKEN) throw new SavesError('Readwise isn’t connected here (the site has no READWISE_ACCESS_TOKEN).');
	return getJson<T>(deps, 'Readwise', `${READWISE}${path}`, { ...init, headers: { authorization: `Token ${deps.env.READWISE_ACCESS_TOKEN}`, ...(init.headers as Record<string, string> | undefined) } });
}

const webUrl = (value: unknown) => (typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined);
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

function readerItem(document: ReaderDocument): SavedItem {
	const url = webUrl(document.source_url) ?? document.url ?? `https://read.readwise.io/read/${document.id}`;
	const title = flat(document.title) || host(url) || 'Untitled';
	const date = day(document.saved_at ?? document.created_at);
	const text = flat(document.summary) || undefined;
	return {
		id: document.id, title, url, kind: document.category ?? 'document', date, text, image: webUrl(document.image_url),
		block: { kind: 'link', url, title, meta: ['Readwise', flat(document.site_name) || host(url), date].filter(Boolean).join(' · '), excerpt: text?.slice(0, 300), image: webUrl(document.image_url), icon: '📖' }
	};
}

const bookUrl = (book: ReadwiseBook) => webUrl(book.source_url) ?? webUrl(book.highlights_url) ?? `https://readwise.io/bookreview/${book.id}`;

function bookItem(book: ReadwiseBook): SavedItem {
	const title = flat(book.title) || 'Untitled', author = flat(book.author).replace(/^By\s+/i, '');
	const count = book.num_highlights ?? 0;
	const text = [author, `${count} highlight${count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
	return {
		id: String(book.id), title, url: bookUrl(book), kind: book.category ?? 'book', date: day(book.last_highlight_at), text, image: webUrl(book.cover_image_url),
		block: { kind: 'link', url: bookUrl(book), title, meta: ['Readwise', author, `${count} highlight${count === 1 ? '' : 's'}`].filter(Boolean).join(' · '), image: webUrl(book.cover_image_url), icon: '📖' }
	};
}

function highlightItem(highlight: { id: number | string; text?: string; note?: string | null; date?: string | null; url?: string | null }, book: { title: string; author?: string; url?: string }): SavedItem {
	const words = flat(highlight.text), note = flat(highlight.note);
	const url = book.url ?? webUrl(highlight.url) ?? `https://readwise.io/open/${highlight.id}`;
	return {
		id: String(highlight.id), title: book.title, url, kind: 'highlight', date: day(highlight.date), text: note ? `${words} (Casey’s note: ${note})` : words,
		block: words ? { kind: 'quote', url, title: book.title, meta: ['Readwise', book.author].filter(Boolean).join(' · '), excerpt: words.slice(0, 600), icon: '📖' } : null
	};
}

/** Reader's shelves and tags, and the kinds of things Casey has highlighted. */
export async function readwisePlaces(deps: SavesDeps): Promise<SavedPlace[]> {
	const [tags, books] = await Promise.all([
		readwiseGet<{ results?: { key?: string; name?: string }[] }>(deps, '/v3/tags/').catch(() => ({ results: [] })),
		readwiseGet<{ count?: number }>(deps, '/v2/books/?page_size=1')
	]);
	return [
		...Object.keys(SHELVES).map((shelf) => ({ in: shelf, title: `Reader: ${shelf}`, kind: 'shelf' })),
		{ in: 'highlights', title: 'Everything Casey highlighted (books, articles, …), newest first', count: books.count, kind: 'highlights' },
		...HIGHLIGHT_KINDS.map((kind) => ({ in: `highlights:${kind}`, title: `Highlighted ${kind}`, kind: 'highlights' })),
		...(tags.results ?? []).filter((tag) => tag.key).map((tag) => ({ in: `tag:${tag.key}`, title: `Tag: ${tag.name ?? tag.key}`, kind: 'tag' }))
	];
}

async function readwiseBooks(deps: SavesDeps): Promise<ReadwiseBook[]> {
	const books: ReadwiseBook[] = [];
	for (let page = 1; page <= 5; page++) {
		const data = await readwiseGet<{ results?: ReadwiseBook[]; next?: string | null }>(deps, `/v2/books/?page_size=1000&page=${page}`);
		books.push(...(data.results ?? []));
		if (!data.next) break;
	}
	return books;
}

async function readwiseList(deps: SavesDeps, options: ListOptions): Promise<SavedPage> {
	const per = options.per ?? PAGE;
	const query = options.query?.trim();
	const wanted = options.in?.trim() ?? '';
	const key = wanted.toLowerCase();
	if (!wanted) {
		if (!query) throw new SavesError('Give `in` (a shelf, tag:<name>, highlights, or a book’s title) or `query`.');
		// Readwise's own search, over the words of every highlight and the titles they come from.
		const data = await readwiseGet<{ results?: { id: number; attributes?: { document_title?: string; document_author?: string; highlight_plaintext?: string; highlight_note?: string } }[] }>(deps, '/mcp/highlights', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ vector_search_term: query, full_text_queries: [{ field_name: 'highlight_plaintext', search_term: query }, { field_name: 'document_title', search_term: query }] })
		});
		const items = (data.results ?? []).map((result) => highlightItem({ id: result.id, text: result.attributes?.highlight_plaintext, note: result.attributes?.highlight_note }, { title: flat(result.attributes?.document_title) || 'Untitled', author: flat(result.attributes?.document_author) || undefined }));
		return { place: { in: 'highlights', title: `Highlights about “${query}”`, kind: 'highlights' }, items: items.slice(0, per), total: items.length };
	}
	const shelf = SHELVES[key] ?? (key === 'new' ? 'new' : undefined);
	const tag = /^tag:\s*(.+)$/i.exec(wanted)?.[1];
	if (shelf || tag) {
		const params = new URLSearchParams({ withHtmlContent: 'false', limit: String(Math.min(per, 100)) });
		if (shelf) params.set('location', shelf); else params.set('tag', tag!);
		if (options.after) params.set('pageCursor', options.after.slice(0, 200));
		const place: SavedPlace = shelf ? { in: key === 'new' ? 'inbox' : key, title: `Reader: ${key === 'new' ? 'inbox' : key}`, kind: 'shelf' } : { in: `tag:${tag}`, title: `Tag: ${tag}`, kind: 'tag' };
		const items: SavedItem[] = [];
		let cursor: string | undefined = options.after, total: number | undefined;
		// A page also carries the highlights and notes made in each document; with words to look for, read a few pages.
		for (let round = 0; round < (query ? 5 : 1); round++) {
			if (cursor) params.set('pageCursor', cursor.slice(0, 200));
			const data = await readwiseGet<{ results?: ReaderDocument[]; nextPageCursor?: string | null; count?: number }>(deps, `/v3/list/?${params}`);
			total = data.count;
			items.push(...(data.results ?? []).filter((document) => !document.parent_id).map(readerItem).filter((item) => !query || matches(item, query)));
			cursor = data.nextPageCursor ?? undefined;
			if (!cursor) break;
		}
		return { place: { ...place, count: query ? undefined : total }, items, total: query ? items.length : total, ...(cursor ? { more: cursor } : {}) };
	}
	const kinds = /^highlights?(?::\s*(\w+))?$/i.exec(wanted);
	if (kinds) {
		const kind = HIGHLIGHT_KINDS.find((one) => one === kinds[1]?.toLowerCase() || one === `${kinds[1]?.toLowerCase()}s`);
		const page = pageNumber(options.after, 1);
		const params = new URLSearchParams({ page_size: String(query ? 1000 : per), page: String(page) });
		if (kind) params.set('category', kind);
		const data = await readwiseGet<{ results?: ReadwiseBook[]; next?: string | null; count?: number }>(deps, `/v2/books/?${params}`);
		const items = (data.results ?? []).filter((book) => (book.num_highlights ?? 0) > 0).map(bookItem).filter((item) => !query || matches(item, query));
		return { place: { in: kind ? `highlights:${kind}` : 'highlights', title: kind ? `Highlighted ${kind}` : 'Everything Casey highlighted', count: data.count, kind: 'highlights' }, items: items.slice(0, query ? per : undefined), total: query ? items.length : data.count, ...(data.next && !query ? { more: String(page + 1) } : {}) };
	}
	// One book, article or podcast: its highlights, in reading order.
	const books = await readwiseBooks(deps);
	const book = /^\d+$/.test(wanted) ? books.find((one) => String(one.id) === wanted) : undefined;
	const place = book ? { in: String(book.id), title: flat(book.title) } : pickPlace(books.filter((one) => (one.num_highlights ?? 0) > 0).map((one) => ({ in: String(one.id), title: flat(one.title) || 'Untitled', count: one.num_highlights, kind: one.category })), wanted, 'highlighted book or article');
	const found = books.find((one) => String(one.id) === place.in)!;
	const page = pageNumber(options.after, 1);
	const data = await readwiseGet<{ results?: ReadwiseHighlight[]; next?: string | null; count?: number }>(deps, `/v2/highlights/?book_id=${place.in}&page_size=${query ? 1000 : per}&page=${page}`);
	const about = { title: flat(found.title) || 'Untitled', author: flat(found.author).replace(/^By\s+/i, '') || undefined, url: webUrl(found.source_url) };
	const items = (data.results ?? []).map((highlight) => highlightItem({ id: highlight.id, text: highlight.text, note: highlight.note, date: highlight.highlighted_at, url: highlight.url ?? highlight.readwise_url }, about)).filter((item) => !query || matches(item, query));
	return {
		place: { in: place.in, title: about.title, count: data.count, kind: found.category, url: bookUrl(found) },
		items: query ? items.slice(0, per) : items, total: query ? items.length : data.count, ...(data.next && !query ? { more: String(page + 1) } : {})
	};
}

const READ_LIMIT = 8000;

async function readwiseRead(deps: SavesDeps, wanted: string, from = 0): Promise<Record<string, unknown>> {
	const id = /([0-9a-z]{26})\s*$/i.exec(wanted.trim())?.[1];
	if (!id) throw new SavesError('Give a Reader document’s id, as a list of a shelf or tag gave it. For a highlighted book, give its title as `in` to list its highlights.');
	const data = await readwiseGet<{ results?: ReaderDocument[] }>(deps, `/v3/list/?id=${id}&withHtmlContent=true`);
	const document = data.results?.[0];
	if (!document) throw new SavesError('Readwise has no document with that id.');
	const item = readerItem(document);
	const words = (document.html_content ?? '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|h\d|li|blockquote|div)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
	const start = Math.max(0, Math.min(from, words.length));
	const part = words.slice(start, start + READ_LIMIT);
	return {
		id: item.id, title: item.title, url: item.url, kind: item.kind, date: item.date, author: flat(document.author) || undefined, shelf: document.location === 'new' ? 'inbox' : document.location ?? undefined,
		tags: Object.keys(document.tags ?? {}), ...(typeof document.reading_progress === 'number' ? { read: `${Math.round(document.reading_progress * 100)}%` } : {}),
		...(item.text ? { summary: clip(item.text, 1200) } : {}), ...(flat(document.notes) ? { note: flat(document.notes) } : {}),
		...(part ? { content: part } : {}),
		...(start + part.length < words.length ? { more: `Characters ${start} to ${start + part.length} of ${words.length}. Only if you need the rest: the same call with from=${start + part.length}.` } : {})
	};
}

// ---------------------------------------------------------------- all three

/** The channels, collections, or shelves and tags of one source. */
export function savedPlaces(deps: SavesDeps, source: SaveSource): Promise<SavedPlace[]> {
	return source === 'arena' ? arenaChannels(deps) : source === 'raindrop' ? raindropCollections(deps) : readwisePlaces(deps);
}

/** One page of what a place holds, or of what matches `query` in it (or in the whole source). */
export function savedList(deps: SavesDeps, source: SaveSource, options: ListOptions): Promise<SavedPage> {
	return source === 'arena' ? arenaList(deps, options) : source === 'raindrop' ? raindropList(deps, options) : readwiseList(deps, options);
}

/** One saved thing in full: a block's text and channels, a bookmark's note and highlights, a Reader document's words. */
export function savedItem(deps: SavesDeps, source: SaveSource, id: string, from?: number): Promise<Record<string, unknown>> {
	return source === 'arena' ? arenaRead(deps, id) : source === 'raindrop' ? raindropRead(deps, id) : readwiseRead(deps, id, from);
}

/**
 * Everything a place holds (or that matches), up to `max`, reading as many pages as that takes:
 * for putting a whole channel on a table in one step.
 */
export async function savedAll(deps: SavesDeps, source: SaveSource, options: ListOptions, max = 100): Promise<SavedPage> {
	const items: SavedItem[] = [];
	let after = options.after, last: SavedPage | undefined;
	for (let round = 0; round < 12 && items.length < max; round++) {
		last = await savedList(deps, source, { ...options, after, per: source === 'raindrop' ? 50 : 100 });
		items.push(...last.items);
		after = last.more;
		if (!after || !last.items.length) break;
	}
	// Cut short of a page boundary, there is no cursor that continues exactly: say how many there are instead.
	const cut = items.length > max;
	return { place: last?.place, items: items.slice(0, max), total: last?.total ?? items.length, ...(after && !cut ? { more: after } : {}) };
}
