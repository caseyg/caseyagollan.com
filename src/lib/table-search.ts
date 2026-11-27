/**
 * Finding words on tables: what each table says (its blocks' titles and excerpts, its notes and
 * text, its areas' names), and which of those a search matches. Shared by the server, which
 * searches saved tables, and the browser, which searches the demo's.
 */
import { plainText } from './table-agent';
import { BLOCK_SHAPE, KIND_ICON, isBlockKind, type TableSummary } from './tables';

/** One thing on a table that has words. */
export interface TableText {
	/** The shape's id, without `shape:`. */
	id: string;
	/** An emoji for what it is. */
	icon: string;
	/** A block's title; empty for notes, text and areas. */
	title: string;
	/** A block's excerpt and line of details, or a note's words. */
	text: string;
}

/** A match: a table, and the thing on it that has the words. */
export interface TableSearchResult {
	/** The table's id and name. */
	table: string;
	name: string;
	/** The thing found, to show on the table; missing when only the table's name matched. */
	item?: string;
	icon: string;
	label: string;
	excerpt?: string;
}

const MAX_TEXTS = 400;
const MAX_WORDS = 1200;
const SHAPE_ICON: Record<string, string> = { note: '🗒️', text: '🔤', frame: '🔲', geo: '⬜', arrow: '↗️' };
const tidy = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** Everything on a saved table that has words, in reading order. */
export function tableTexts(document: unknown): TableText[] {
	const store = (document as { store?: Record<string, unknown> } | null)?.store;
	if (!store || typeof store !== 'object') return [];
	const found: (TableText & { x: number; y: number })[] = [];
	for (const record of Object.values(store)) {
		const shape = record as { typeName?: string; id?: string; type?: string; x?: number; y?: number; props?: Record<string, unknown> } | null;
		if (shape?.typeName !== 'shape' || typeof shape.id !== 'string' || typeof shape.type !== 'string') continue;
		const props = shape.props ?? {};
		const block = shape.type === BLOCK_SHAPE;
		const title = block ? tidy(props.title) : '';
		const text = block ? [tidy(props.excerpt), tidy(props.meta)].filter(Boolean).join(' · ') : shape.type === 'frame' ? tidy(props.name) : tidy(plainText(props.richText));
		if (!title && !text) continue;
		const icon = block ? tidy(props.icon) || (isBlockKind(props.kind) ? KIND_ICON[props.kind] : '🔗') : (SHAPE_ICON[shape.type] ?? '✏️');
		found.push({ id: shape.id.replace(/^shape:/, ''), icon, title, text: text.slice(0, MAX_WORDS), x: Number(shape.x) || 0, y: Number(shape.y) || 0 });
	}
	found.sort((a, b) => a.y - b.y || a.x - b.x);
	return found.slice(0, MAX_TEXTS).map(({ x: _x, y: _y, ...text }) => text);
}

/** Lower case and without accents, the same length as the text, so "cafe" finds "Café". */
const fold = (text: string) => text.toLowerCase().replace(/[À-ɏ]/g, (letter) => letter.normalize('NFD')[0]);
export const searchWords = (query: string) => fold(query).split(/\s+/).filter(Boolean).slice(0, 8);

/** The words around the first typed word found, for a result's second line. */
function around(text: string, words: string[], length = 140): string {
	const folded = fold(text);
	const at = Math.min(...words.map((word) => folded.indexOf(word)).filter((index) => index >= 0), text.length);
	if (text.length <= length) return text;
	const start = Math.max(0, Math.min(at - 40, text.length - length));
	return `${start > 0 ? '…' : ''}${text.slice(start, start + length).trim()}${start + length < text.length ? '…' : ''}`;
}

/**
 * The things on these tables holding every typed word, a few from each table so one table can't
 * crowd out the rest; a table whose name alone matches is listed too. Tables come in the order given.
 */
export function searchTableTexts(tables: { table: Pick<TableSummary, 'id' | 'name'>; texts: TableText[] }[], query: string, limit = 12, perTable = 3): TableSearchResult[] {
	const words = searchWords(query);
	if (!words.length) return [];
	const results: TableSearchResult[] = [];
	for (const { table, texts } of tables) {
		const named = words.every((word) => fold(table.name).includes(word));
		const matches = texts.filter((entry) => { const all = fold(`${entry.title} ${entry.text}`); return words.every((word) => all.includes(word)); }).slice(0, perTable);
		if (named && !matches.length) results.push({ table: table.id, name: table.name, icon: '🗂️', label: table.name });
		for (const entry of matches) {
			const label = entry.title || around(entry.text, words, 80);
			const excerpt = entry.title && entry.text ? around(entry.text, words) : '';
			results.push({ table: table.id, name: table.name, item: entry.id, icon: entry.icon, label, excerpt: excerpt || undefined });
		}
		if (results.length >= limit) break;
	}
	return results.slice(0, limit);
}

/** The link that opens a table showing one thing on it. */
export const ITEM_HASH = 'item';
export const itemHash = (item?: string) => (item ? `#${ITEM_HASH}=${encodeURIComponent(item)}` : '');
/** The thing a table's address asks to show. */
export function hashItem(hash: string): string | null {
	const item = new URLSearchParams(hash.replace(/^#/, '')).get(ITEM_HASH);
	return item && /^[\w:-]{1,80}$/.test(item) ? item : null;
}
