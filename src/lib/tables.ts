/**
 * Tables: canvases of blocks taken from the site (posts, books, wiki pages), Casey's Are.na, and the web (links).
 * Shared by the browser and the server; the canvas itself is a tldraw document.
 */

export type BlockKind = 'post' | 'book' | 'wiki' | 'arena' | 'link';

/** What a block shows, saved with it so a table reads the same if the source moves or changes. */
export interface Block {
	kind: BlockKind;
	/** Opened on double-click. Site pages are root-relative; others are absolute. */
	url: string;
	title: string;
	/** A short line under the title: post type and date, a book's author, a link's host. */
	meta?: string;
	excerpt?: string;
	image?: string;
	/** An emoji for the corner tile; defaults to the kind's. */
	icon?: string;
}

/** A table as the browse page lists it. */
export interface TableSummary {
	id: string;
	name: string;
	/** ISO timestamps. */
	created: string;
	updated: string;
	/** How many blocks are on it. */
	count: number;
	/** The first few blocks, for the card's thumbnail. */
	preview: Block[];
}

/** A table with its canvas: a tldraw store snapshot's document (`{ store, schema }`). */
export interface Table extends TableSummary {
	document: unknown;
}

export const BLOCK_SHAPE = 'site-block';
export const KIND_ICON: Record<BlockKind, string> = { post: '📡', book: '📚', wiki: '🌱', arena: '✳️', link: '🔗' };
export const KIND_LABEL: Record<BlockKind, string> = { post: 'Post', book: 'Book', wiki: 'Wiki', arena: 'Are.na', link: 'Link' };
/** Are.na blocks' emoji by their type; channels have their own. */
export const ARENA_ICON: Record<string, string> = { channel: '✳️', image: '🖼️', link: '🔗', text: '📝', embed: '🎬', attachment: '📎' };
/** Post types' emoji, as in the posts feed. */
export const POST_ICON: Record<string, string> = { note: '📝', article: '📄', photo: '📷', video: '🎬', bookmark: '🔖', like: '⭐', repost: '🔁', reply: '💬', checkin: '📍', rsvp: '📅' };

export const MAX_NAME = 120;
export const MAX_TABLES = 500;
export const MAX_DOCUMENT_BYTES = 2_000_000;
const MAX_TEXT = 600;
const PREVIEW_COUNT = 4;

export const isBlockKind = (value: unknown): value is BlockKind => value === 'post' || value === 'book' || value === 'wiki' || value === 'arena' || value === 'link';
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{4,40}$/.test(value);

export function newTableId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

export function cleanName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
	return name || null;
}

const text = (value: unknown, max = MAX_TEXT) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/** A link a block may open: http(s), or a path on this site. */
export function blockUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const url = value.trim();
	if (/^\/(?!\/)/.test(url)) return url.slice(0, 2000);
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href.slice(0, 2000) : null;
	} catch {
		return null;
	}
}

/** Imagery may come from this site or https only. */
function imageUrl(value: unknown): string | undefined {
	const url = blockUrl(value);
	return url && (url.startsWith('/') || url.startsWith('https:')) ? url : undefined;
}

export function cleanBlock(value: unknown): Block | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	const url = blockUrl(raw.url);
	const title = text(raw.title, 300);
	if (!isBlockKind(raw.kind) || !url || !title) return null;
	return { kind: raw.kind, url, title, meta: text(raw.meta, 200), excerpt: text(raw.excerpt), image: imageUrl(raw.image), icon: text(raw.icon, 16) };
}

/** The block a kind of shape stands for, or null for drawings, notes and arrows. */
function shapeBlock(record: unknown): { block: Block; y: number; x: number } | null {
	if (!record || typeof record !== 'object') return null;
	const shape = record as { typeName?: string; type?: string; x?: number; y?: number; props?: unknown };
	if (shape.typeName !== 'shape' || shape.type !== BLOCK_SHAPE) return null;
	const block = cleanBlock(shape.props);
	return block ? { block, x: Number(shape.x) || 0, y: Number(shape.y) || 0 } : null;
}

/** Counts a document's blocks and picks the top-left few, reading order, for the browse card. */
export function summarizeDocument(document: unknown): { count: number; preview: Block[] } {
	const store = (document as { store?: Record<string, unknown> } | null)?.store;
	if (!store || typeof store !== 'object') return { count: 0, preview: [] };
	const blocks = Object.values(store).map(shapeBlock).filter((entry) => entry !== null);
	blocks.sort((a, b) => a.y - b.y || a.x - b.x);
	return { count: blocks.length, preview: blocks.slice(0, PREVIEW_COUNT).map((entry) => entry.block) };
}

/** A saved document must be a tldraw snapshot document and small enough to keep. */
export function validDocument(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const { store, schema } = value as { store?: unknown; schema?: unknown };
	if (!store || typeof store !== 'object' || !schema || typeof schema !== 'object') return false;
	return JSON.stringify(value).length <= MAX_DOCUMENT_BYTES;
}

export function emptyTable(name: string, id = newTableId(), now = new Date().toISOString()): Table {
	return { id, name, created: now, updated: now, count: 0, preview: [], document: null };
}

export function toSummary({ document: _document, ...summary }: Table): TableSummary {
	return summary;
}

/** Newest change first. */
export const byUpdated = (a: TableSummary, b: TableSummary) => b.updated.localeCompare(a.updated);

/** The emoji in a block's corner. */
export const blockIcon = (block: Pick<Block, 'kind' | 'icon'>) => block.icon || KIND_ICON[block.kind];

/** Where double-clicking a block goes; site paths resolve against this origin. */
export function blockHref(block: Pick<Block, 'url'>, origin: string): string {
	return new URL(block.url, origin).href;
}

const SITE_HOSTS = new Set(['caseyagollan.com', 'www.caseyagollan.com']);

/** A link pasted or typed in: this site's own pages keep a site path; the rest stay links. */
export function linkBlock(input: string, origin?: string): Block | null {
	const raw = input.trim();
	if (!raw) return null;
	let url: URL;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	const host = url.hostname.replace(/^www\./, '');
	const local = SITE_HOSTS.has(url.hostname) || (origin !== undefined && url.origin === origin);
	const path = decodeURIComponent(url.pathname.replace(/\/+$/, ''));
	const title = path && path !== '' ? `${host}${path}` : host;
	if (local) return { kind: 'link', url: `${url.pathname}${url.search}${url.hash}`, title: path || 'caseyagollan.com', meta: 'caseyagollan.com', icon: '🏠' };
	return { kind: 'link', url: url.href, title, meta: host, image: `/api/screenshot?url=${encodeURIComponent(url.href)}` };
}
