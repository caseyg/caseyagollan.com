/**
 * The site's own copy of what Casey keeps elsewhere, as one SQLite database with full-text search
 * (FTS5). It runs inside the `SourceStore` Durable Object (`store.ts`); tests and the chat replay
 * give it `bun:sqlite` instead, so the SQL here is the SQL that runs.
 *
 * Privacy is decided here, once: every read takes `owner`, and without it only documents whose
 * plugin marked them public come back. Callers must pass `owner: true` only for the signed-in
 * owner (`ownerSources` in `access.ts`).
 */
import { documentKey, type LooseHighlight, type SourceDocument, type SourceHighlight, type SyncState } from './types';

/** The little of a SQLite connection this needs. */
export interface Sql {
	all<T = Record<string, unknown>>(query: string, ...params: unknown[]): T[];
}

/** The longest text kept for one document: SQLite in a Durable Object takes 2 MB a row. */
export const TEXT_LIMIT = 900_000;
/** Words of its own a link needs before its page is worth reading for more. */
const THIN = 80;

export interface SearchOptions {
	/** True only for the signed-in owner; otherwise private documents are left out. */
	owner: boolean;
	query?: string;
	/** One source, or several. */
	source?: string | string[];
	kind?: string;
	/** A channel, collection or shelf, by its title. */
	place?: string;
	tag?: string;
	/** ISO dates bounding when it was saved. */
	since?: string;
	until?: string;
	/** Only documents Casey highlighted. */
	highlighted?: boolean;
	limit?: number;
	offset?: number;
}

/** A document as a search answers it: enough to show and to decide whether to read it. */
export interface SourceHit {
	key: string;
	source: string;
	id: string;
	kind: string;
	title: string;
	url: string;
	openUrl?: string;
	/** YYYY-MM-DD it was saved. */
	date?: string;
	/** ISO time it was saved, for lists in order of time. */
	saved?: string;
	site?: string;
	author?: string;
	/** The words around the match, or the summary when browsing. */
	excerpt?: string;
	image?: string;
	tags: string[];
	places: string[];
	private: boolean;
	ref?: string;
	highlights: number;
	/** Characters of text kept, so a reader knows whether there is more than the excerpt. */
	length: number;
}

export interface SearchResult {
	hits: SourceHit[];
	/** How many match in all. */
	total: number;
	/** Whether every word was required (`all`) or the search fell back to any of them (`any`). */
	matched?: 'all' | 'any';
}

export interface StoredDocument extends SourceHit {
	summary?: string;
	updated?: string;
	published?: string;
	extra: Record<string, string | number | boolean>;
	links: string[];
	/** The part of the text asked for. */
	text: string;
	from: number;
	/** Where the text came from: the service itself, or the page it links to. */
	textFrom?: 'source' | 'page';
	allHighlights: SourceHighlight[];
}

export interface SourceStats { source: string; documents: number; private: number; highlights: number; withText: number; embedded: number; newest?: string; synced?: string }

interface Row {
	rowid: number; key: string; source: string; id: string; kind: string; title: string; url: string; open_url: string | null; summary: string | null;
	author: string | null; site: string | null; image: string | null; tags: string; places: string; created: string | null; updated: string | null;
	published: string | null; private: number; ref: string | null; extra: string; links: string; own_highlights: string; length: number; text_from: string | null;
	highlight_count: number; snip?: string | null;
}

const json = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? (JSON.parse(value) as T) : fallback; } catch { return fallback; } };
const words = (text: string) => (text.match(/\S+/g) ?? []).length;

/** The words of a query as FTS5 terms, each quoted so nothing a person types is read as syntax. */
export function ftsTerms(query: string): string[] {
	return [...new Set((query.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 1 || /\p{N}/u.test(word)))].slice(0, 12).map((word) => `"${word}"`);
}

export class SourceIndex {
	constructor(private readonly sql: Sql) {}

	/** Creates the tables. Safe to call on every start. */
	migrate(): void {
		this.sql.all(`CREATE TABLE IF NOT EXISTS docs (
			rowid INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, source TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
			open_url TEXT, summary TEXT, author TEXT, site TEXT, image TEXT, tags TEXT NOT NULL DEFAULT '[]', places TEXT NOT NULL DEFAULT '[]',
			created TEXT, updated TEXT, published TEXT, private INTEGER NOT NULL DEFAULT 1, ref TEXT, extra TEXT NOT NULL DEFAULT '{}', links TEXT NOT NULL DEFAULT '[]',
			own_highlights TEXT NOT NULL DEFAULT '[]', length INTEGER NOT NULL DEFAULT 0, words INTEGER NOT NULL DEFAULT 0, text_from TEXT, filled_at TEXT,
			embedded TEXT, image_embedded TEXT, hash TEXT, highlight_count INTEGER NOT NULL DEFAULT 0, synced_at TEXT NOT NULL)`);
		this.sql.all('CREATE INDEX IF NOT EXISTS docs_source_created ON docs (source, created DESC)');
		this.sql.all('CREATE INDEX IF NOT EXISTS docs_url ON docs (url)');
		this.sql.all('CREATE TABLE IF NOT EXISTS highlights (key TEXT PRIMARY KEY, source TEXT NOT NULL, id TEXT NOT NULL, parent TEXT NOT NULL, text TEXT NOT NULL, note TEXT, created TEXT, tags TEXT NOT NULL DEFAULT \'[]\')');
		this.sql.all('CREATE INDEX IF NOT EXISTS highlights_parent ON highlights (source, parent)');
		this.sql.all("CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(title, body, highlights, meta, tokenize = 'porter unicode61 remove_diacritics 2')");
		this.sql.all('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
		// One vector for a document's words and one for its picture, as little-endian 32-bit floats of unit length.
		this.sql.all('CREATE TABLE IF NOT EXISTS vectors (key TEXT NOT NULL, what TEXT NOT NULL, v BLOB NOT NULL, PRIMARY KEY (key, what))');
	}

	// ------------------------------------------------------------ writing

	/** Every highlight of one document: those it carries itself, then those that arrived on their own, oldest first. */
	private highlightsOf(source: string, id: string, own: SourceHighlight[]): SourceHighlight[] {
		const loose = this.sql.all<{ id: string; text: string; note: string | null; created: string | null; tags: string }>('SELECT id, text, note, created, tags FROM highlights WHERE source = ? AND parent = ? ORDER BY created, key', source, id)
			.map((row) => ({ id: row.id, text: row.text, ...(row.note ? { note: row.note } : {}), ...(row.created ? { created: row.created } : {}), tags: json<string[]>(row.tags, []) }));
		const seen = new Set(own.map((highlight) => highlight.id));
		return [...own, ...loose.filter((highlight) => !seen.has(highlight.id))];
	}

	private highlightText(highlights: SourceHighlight[]): string {
		return highlights.map((highlight) => (highlight.note ? `${highlight.text}\n(${highlight.note})` : highlight.text)).join('\n\n');
	}

	/**
	 * Adds or replaces documents. A document that comes without text keeps the text already held
	 * (a page read to fill in a thin link isn't thrown away by the next sync).
	 */
	upsert(documents: (SourceDocument & { keepPlaces?: boolean })[], now = new Date().toISOString()): { added: number; changed: number } {
		let added = 0, changed = 0;
		for (const given of documents) {
			const key = documentKey(given.source, given.id);
			const kept = given.keepPlaces ? this.sql.all<{ places: string }>('SELECT places FROM docs WHERE key = ?', key)[0] : undefined;
			const document = kept ? { ...given, places: json<string[]>(kept.places, []) } : given;
			const text = (document.text ?? '').slice(0, TEXT_LIMIT);
			const own = document.highlights ?? [];
			const highlights = this.highlightsOf(document.source, document.id, own);
			const meta = [document.author, document.site, document.summary, document.note, document.tags.join(' '), document.places.join(' '), document.url].filter(Boolean).join('\n');
			const hash = `${document.title}\n${document.summary ?? ''}\n${text.length}:${text.slice(0, 2000)}`;
			const existing = this.sql.all<{ rowid: number; hash: string | null; text_from: string | null; image: string | null }>('SELECT rowid, hash, text_from, image FROM docs WHERE key = ?', key)[0];
			// A picture found on the page stays when the source itself has none.
			const image = document.image ?? (existing?.text_from === 'page' ? existing.image : null) ?? null;
			const fields = [
				document.kind, document.title, document.url, document.openUrl ?? null, document.summary ?? null, document.author ?? null, document.site ?? null, image,
				JSON.stringify(document.tags), JSON.stringify(document.places), document.created ?? null, document.updated ?? null, document.published ?? null, document.private ? 1 : 0,
				document.ref ?? null, JSON.stringify({ ...document.extra, ...(document.note ? { note: document.note } : {}) }), JSON.stringify(document.links ?? []), JSON.stringify(own), highlights.length, now
			];
			const columns = 'kind = ?, title = ?, url = ?, open_url = ?, summary = ?, author = ?, site = ?, image = ?, tags = ?, places = ?, created = ?, updated = ?, published = ?, private = ?, ref = ?, extra = ?, links = ?, own_highlights = ?, highlight_count = ?, synced_at = ?';
			if (existing) {
				this.sql.all(`UPDATE docs SET ${columns} WHERE rowid = ?`, ...fields, existing.rowid);
				// Text from the source replaces what is held; a source with none leaves a page's text alone.
				if (text || existing.text_from !== 'page') {
					if (hash !== existing.hash) { changed++; this.sql.all('UPDATE docs SET hash = ?, embedded = NULL WHERE rowid = ?', hash, existing.rowid); }
					this.sql.all('UPDATE docs SET length = ?, words = ?, text_from = ? WHERE rowid = ?', text.length, words(text), text ? 'source' : null, existing.rowid);
					this.sql.all('UPDATE docs_fts SET title = ?, body = ?, highlights = ?, meta = ? WHERE rowid = ?', document.title, text, this.highlightText(highlights), meta, existing.rowid);
				} else {
					this.sql.all('UPDATE docs_fts SET title = ?, highlights = ?, meta = ? WHERE rowid = ?', document.title, this.highlightText(highlights), meta, existing.rowid);
				}
				if (image !== existing.image) this.sql.all('UPDATE docs SET image_embedded = NULL WHERE rowid = ?', existing.rowid);
			} else {
				added++;
				const [{ rowid }] = this.sql.all<{ rowid: number }>(
					`INSERT INTO docs (key, source, id, kind, title, url, open_url, summary, author, site, image, tags, places, created, updated, published, private, ref, extra, links, own_highlights, highlight_count, synced_at, length, words, text_from, hash)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING rowid`,
					key, document.source, document.id, ...fields, text.length, words(text), text ? 'source' : null, hash
				);
				this.sql.all('INSERT INTO docs_fts (rowid, title, body, highlights, meta) VALUES (?, ?, ?, ?, ?)', rowid, document.title, text, this.highlightText(highlights), meta);
			}
		}
		return { added, changed };
	}

	/** Highlights that came apart from their documents. One whose document isn't here yet waits for it. */
	upsertHighlights(highlights: LooseHighlight[], source: string): void {
		const parents = new Set<string>();
		for (const highlight of highlights) {
			if (!highlight.text.trim()) continue;
			this.sql.all('INSERT OR REPLACE INTO highlights (key, source, id, parent, text, note, created, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
				documentKey(source, highlight.id), source, highlight.id, highlight.parent, highlight.text, highlight.note ?? null, highlight.created ?? null, JSON.stringify(highlight.tags ?? []));
			parents.add(highlight.parent);
		}
		for (const parent of parents) this.reindexHighlights(source, parent);
	}

	private reindexHighlights(source: string, id: string): void {
		const row = this.sql.all<{ rowid: number; own_highlights: string }>('SELECT rowid, own_highlights FROM docs WHERE key = ?', documentKey(source, id))[0];
		if (!row) return;
		const highlights = this.highlightsOf(source, id, json<SourceHighlight[]>(row.own_highlights, []));
		this.sql.all('UPDATE docs SET highlight_count = ?, embedded = NULL WHERE rowid = ?', highlights.length, row.rowid);
		this.sql.all('UPDATE docs_fts SET highlights = ? WHERE rowid = ?', this.highlightText(highlights), row.rowid);
	}

	/** Takes documents (and their highlights) out, by id at one source. Returns the keys that were there. */
	remove(source: string, ids: string[]): string[] {
		const gone: string[] = [];
		for (const id of ids) {
			const row = this.sql.all<{ rowid: number }>('SELECT rowid FROM docs WHERE key = ?', documentKey(source, id))[0];
			this.sql.all('DELETE FROM highlights WHERE source = ? AND (parent = ? OR id = ?)', source, id, id);
			if (!row) continue;
			this.sql.all('DELETE FROM docs_fts WHERE rowid = ?', row.rowid);
			this.sql.all('DELETE FROM docs WHERE rowid = ?', row.rowid);
			this.sql.all('DELETE FROM vectors WHERE key = ?', documentKey(source, id));
			this.matrix = undefined;
			gone.push(documentKey(source, id));
		}
		return gone;
	}

	removeHighlights(source: string, ids: string[]): void {
		const parents = new Set<string>();
		for (const id of ids) {
			const row = this.sql.all<{ parent: string }>('SELECT parent FROM highlights WHERE key = ?', documentKey(source, id))[0];
			if (!row) continue;
			this.sql.all('DELETE FROM highlights WHERE key = ?', documentKey(source, id));
			parents.add(row.parent);
		}
		for (const parent of parents) this.reindexHighlights(source, parent);
	}

	/** Makes `ids` the documents of one place: they gain it, and any other document of the source loses it. */
	setPlace(source: string, place: string, ids: string[]): void {
		const wanted = new Set(ids.map((id) => documentKey(source, id)));
		const holding = this.sql.all<{ rowid: number; key: string; places: string }>('SELECT d.rowid, d.key, d.places FROM docs d, json_each(d.places) WHERE d.source = ? AND json_each.value = ?', source, place);
		for (const row of holding) {
			if (wanted.has(row.key)) { wanted.delete(row.key); continue; }
			this.writePlaces(row.rowid, json<string[]>(row.places, []).filter((one) => one !== place));
		}
		for (const key of wanted) {
			const row = this.sql.all<{ rowid: number; places: string }>('SELECT rowid, places FROM docs WHERE key = ?', key)[0];
			if (row) this.writePlaces(row.rowid, [...json<string[]>(row.places, []), place]);
		}
	}

	private writePlaces(rowid: number, places: string[]): void {
		this.sql.all('UPDATE docs SET places = ? WHERE rowid = ?', JSON.stringify(places), rowid);
		const row = this.sql.all<{ author: string | null; site: string | null; summary: string | null; tags: string; url: string; extra: string }>('SELECT author, site, summary, tags, url, extra FROM docs WHERE rowid = ?', rowid)[0];
		const meta = [row.author, row.site, row.summary, json<{ note?: string }>(row.extra, {}).note, json<string[]>(row.tags, []).join(' '), places.join(' '), row.url].filter(Boolean).join('\n');
		this.sql.all('UPDATE docs_fts SET meta = ? WHERE rowid = ?', meta, rowid);
	}

	/** After a pass that listed everything: what the source no longer holds. */
	removeUnseen(source: string, before: string): string[] {
		const ids = this.sql.all<{ id: string }>('SELECT id FROM docs WHERE source = ? AND synced_at < ?', source, before).map((row) => row.id);
		return this.remove(source, ids);
	}

	/** Keeps the text of the page a thin link leads to. */
	fill(key: string, page: { text: string; links?: string[]; image?: string } | null, now = new Date().toISOString()): void {
		const row = this.sql.all<{ rowid: number; image: string | null }>('SELECT rowid, image FROM docs WHERE key = ?', key)[0];
		if (!row) return;
		const text = (page?.text ?? '').slice(0, TEXT_LIMIT);
		if (!text) { this.sql.all('UPDATE docs SET filled_at = ? WHERE rowid = ?', now, row.rowid); return; }
		this.sql.all('UPDATE docs SET filled_at = ?, length = ?, words = ?, text_from = ?, embedded = NULL WHERE rowid = ?', now, text.length, words(text), 'page', row.rowid);
		if (page?.links?.length) this.sql.all('UPDATE docs SET links = ? WHERE rowid = ?', JSON.stringify(page.links.slice(0, 300)), row.rowid);
		if (page?.image && !row.image) this.sql.all('UPDATE docs SET image = ?, image_embedded = NULL WHERE rowid = ?', page.image, row.rowid);
		this.sql.all('UPDATE docs_fts SET body = ? WHERE rowid = ?', text, row.rowid);
	}

	/** Links with few words of their own whose page hasn't been read yet, newest first. */
	thin(limit: number): { key: string; url: string }[] {
		return this.sql.all<{ key: string; url: string }>(
			"SELECT key, url FROM docs WHERE filled_at IS NULL AND words < ? AND kind NOT IN ('channel', 'image', 'text', 'book', 'highlight') AND url LIKE 'http%' ORDER BY created DESC LIMIT ?", THIN, limit
		);
	}

	// ------------------------------------------------------------ embeddings

	/** Documents whose words (or picture) have no vector yet, newest first. */
	unembedded(what: 'text' | 'image', limit: number): { key: string; title: string; summary: string; text: string; highlights: string; image?: string; private: boolean; source: string; kind: string }[] {
		const where = what === 'text' ? 'd.embedded IS NULL' : "d.image_embedded IS NULL AND d.image IS NOT NULL AND d.image != ''";
		return this.sql.all<{ key: string; title: string; summary: string | null; text: string; highlights: string; image: string | null; private: number; source: string; kind: string }>(
			`SELECT d.key, d.title, d.summary, substr(f.body, 1, 6000) AS text, substr(f.highlights, 1, 2000) AS highlights, d.image, d.private, d.source, d.kind
			 FROM docs d JOIN docs_fts f ON f.rowid = d.rowid WHERE ${where} ORDER BY d.created DESC LIMIT ?`, limit
		).map((row) => ({ ...row, summary: row.summary ?? '', image: row.image ?? undefined, private: !!row.private }));
	}

	/** Records that a document's words or picture were embedded (or couldn't be: `failed` isn't tried again). */
	embedded(what: 'text' | 'image', keys: string[], value: string): void {
		for (const key of keys) this.sql.all(`UPDATE docs SET ${what === 'text' ? 'embedded' : 'image_embedded'} = ? WHERE key = ?`, value, key);
	}

	/** Keeps a vector, scaled to unit length so likeness is a dot product. */
	saveVector(key: string, what: 'text' | 'image', values: ArrayLike<number>): void {
		const vector = Float32Array.from(values);
		let norm = 0;
		for (const value of vector) norm += value * value;
		norm = Math.sqrt(norm) || 1;
		for (let index = 0; index < vector.length; index++) vector[index] /= norm;
		this.sql.all('INSERT OR REPLACE INTO vectors (key, what, v) VALUES (?, ?, ?)', key, what, new Uint8Array(vector.buffer));
		this.matrix = undefined;
	}

	/** Every vector, read once and kept until one changes: a few megabytes for some thousands of documents. */
	private matrix?: { keys: string[]; whats: string[]; vectors: Float32Array[] };
	private loadVectors() {
		if (this.matrix) return this.matrix;
		const rows = this.sql.all<{ key: string; what: string; v: ArrayBuffer | Uint8Array }>('SELECT key, what, v FROM vectors');
		const floats = (blob: ArrayBuffer | Uint8Array) => { const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob); return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); };
		return (this.matrix = { keys: rows.map((row) => row.key), whats: rows.map((row) => row.what), vectors: rows.map((row) => floats(row.v)) });
	}

	vectorOf(key: string, what: 'text' | 'image'): Float32Array | undefined {
		const { keys, whats, vectors } = this.loadVectors();
		const at = keys.findIndex((one, index) => one === key && whats[index] === what);
		return at < 0 ? undefined : vectors[at];
	}

	/**
	 * The documents whose vectors lie nearest `query`, nearest first, each once (by its better
	 * vector). Compared one by one: at this size that is a few milliseconds and needs no other service.
	 */
	nearest(query: ArrayLike<number>, options: { what?: 'text' | 'image'; not?: string; limit?: number } = {}): { key: string; score: number; what: string }[] {
		const { keys, whats, vectors } = this.loadVectors();
		let norm = 0;
		for (let index = 0; index < query.length; index++) norm += query[index] * query[index];
		norm = Math.sqrt(norm) || 1;
		const best = new Map<string, { key: string; score: number; what: string }>();
		for (let row = 0; row < vectors.length; row++) {
			if ((options.what && whats[row] !== options.what) || keys[row] === options.not) continue;
			const vector = vectors[row];
			if (vector.length !== query.length) continue;
			let dot = 0;
			for (let index = 0; index < vector.length; index++) dot += vector[index] * query[index];
			const score = dot / norm;
			const had = best.get(keys[row]);
			if (!had || score > had.score) best.set(keys[row], { key: keys[row], score, what: whats[row] });
		}
		return [...best.values()].sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20);
	}

	// ------------------------------------------------------------ reading

	private where(options: SearchOptions): { clause: string; params: unknown[] } {
		const clauses: string[] = [], params: unknown[] = [];
		// The one place privacy is applied to reads.
		if (options.owner !== true) clauses.push('d.private = 0');
		const sources = (Array.isArray(options.source) ? options.source : options.source ? [options.source] : []).filter(Boolean);
		if (sources.length) { clauses.push(`d.source IN (${sources.map(() => '?').join(', ')})`); params.push(...sources); }
		if (options.kind) { clauses.push('d.kind = ?'); params.push(options.kind.toLowerCase()); }
		// A place or tag can only be asked for by the owner: asked by anyone else, nothing matches.
		if ((options.place || options.tag) && options.owner !== true) clauses.push('0');
		if (options.place) { clauses.push('EXISTS (SELECT 1 FROM json_each(d.places) WHERE lower(json_each.value) = lower(?))'); params.push(options.place); }
		if (options.tag) { clauses.push('EXISTS (SELECT 1 FROM json_each(d.tags) WHERE lower(json_each.value) = lower(?))'); params.push(options.tag); }
		if (options.since) { clauses.push('d.created >= ?'); params.push(options.since); }
		if (options.until) { clauses.push('d.created < ?'); params.push(options.until.length === 10 ? `${options.until}~` : options.until); }
		if (options.highlighted) clauses.push('d.highlight_count > 0');
		return { clause: clauses.length ? clauses.join(' AND ') : '1', params };
	}

	/** A row as a result. Where things are kept and how they are tagged can name private places, so only the owner is told. */
	private hit(row: Row, owner = true): SourceHit {
		const excerpt = (row.snip ?? row.summary ?? '').replace(/\s+/g, ' ').trim();
		return {
			key: row.key, source: row.source, id: row.id, kind: row.kind, title: row.title, url: row.url, ...(row.open_url ? { openUrl: row.open_url } : {}),
			...(row.created ? { date: row.created.slice(0, 10), saved: row.created } : {}), ...(row.site ? { site: row.site } : {}), ...(row.author ? { author: row.author } : {}),
			...(excerpt ? { excerpt } : {}), ...(row.image ? { image: row.image } : {}), tags: owner ? json<string[]>(row.tags, []) : [], places: owner ? json<string[]>(row.places, []) : [],
			private: !!row.private, ...(row.ref ? { ref: row.ref } : {}), highlights: row.highlight_count, length: row.length
		};
	}

	/**
	 * With words: the best matches, by where the words fall (title and highlights count for more
	 * than body text). Every word is required; when nothing has them all, any of them will do.
	 * Without words: what the filters leave, newest first.
	 */
	search(options: SearchOptions): SearchResult {
		const limit = Math.min(Math.max(options.limit ?? 20, 1), 100), offset = Math.max(options.offset ?? 0, 0);
		const { clause, params } = this.where(options);
		const terms = ftsTerms(options.query ?? '');
		if (!terms.length) {
			const [{ total }] = this.sql.all<{ total: number }>(`SELECT count(*) AS total FROM docs d WHERE ${clause}`, ...params);
			const rows = this.sql.all<Row>(`SELECT d.* FROM docs d WHERE ${clause} ORDER BY d.created DESC, d.rowid DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
			return { hits: rows.map((row) => this.hit(row, options.owner === true)), total };
		}
		const run = (match: string) => {
			const [{ total }] = this.sql.all<{ total: number }>(`SELECT count(*) AS total FROM docs_fts JOIN docs d ON d.rowid = docs_fts.rowid WHERE docs_fts MATCH ? AND ${clause}`, match, ...params);
			if (!total) return null;
			const rows = this.sql.all<Row>(
				`SELECT d.*, snippet(docs_fts, -1, '', '', '…', 48) AS snip FROM docs_fts JOIN docs d ON d.rowid = docs_fts.rowid
				 WHERE docs_fts MATCH ? AND ${clause} ORDER BY bm25(docs_fts, 8.0, 1.0, 4.0, 2.0) LIMIT ? OFFSET ?`, match, ...params, limit, offset
			);
			return { hits: rows.map((row) => this.hit(row, options.owner === true)), total };
		};
		const all = run(terms.join(' '));
		if (all) return { ...all, matched: 'all' };
		const any = terms.length > 1 ? run(terms.join(' OR ')) : null;
		return any ? { ...any, matched: 'any' } : { hits: [], total: 0, matched: 'all' };
	}

	/** Several documents by key, in the order asked: for results that come from the vector index. */
	byKeys(keys: string[], owner: boolean): SourceHit[] {
		if (!keys.length) return [];
		const rows = this.sql.all<Row>(`SELECT d.* FROM docs d WHERE d.key IN (${keys.map(() => '?').join(', ')}) AND ${owner === true ? '1' : 'd.private = 0'}`, ...keys);
		const found = new Map(rows.map((row) => [row.key, this.hit(row, owner === true)]));
		return keys.map((key) => found.get(key)).filter((hit) => hit !== undefined);
	}

	/**
	 * One document whole: by its key (`readwise:01abc…`), its id at a source, or its address
	 * (the page's or the service's). Its text comes `limit` characters at a time from `from`.
	 */
	get(wanted: string, options: { owner: boolean; source?: string; from?: number; limit?: number }): StoredDocument | null {
		const asked = wanted.trim();
		const bare = asked.replace(/[#?].*$/, '').replace(/\/+$/, '');
		const row = this.sql.all<Row>(
			`SELECT d.* FROM docs d WHERE (d.key = ? OR (d.id = ? AND (? IS NULL OR d.source = ?)) OR d.url IN (?, ?, ?) OR d.open_url IN (?, ?, ?)) AND ${options.owner === true ? '1' : 'd.private = 0'}
			 ORDER BY (d.key = ?) DESC, d.length DESC LIMIT 1`,
			asked, asked, options.source ?? null, options.source ?? null, asked, bare, `${bare}/`, asked, bare, `${bare}/`, asked
		)[0];
		if (!row) return null;
		const from = Math.max(0, Math.floor(options.from ?? 0)), limit = Math.min(Math.max(options.limit ?? 8000, 1), TEXT_LIMIT);
		// SQLite counts characters from 1.
		const [{ text }] = this.sql.all<{ text: string }>('SELECT substr(body, ?, ?) AS text FROM docs_fts WHERE rowid = ?', from + 1, limit, row.rowid);
		return {
			...this.hit({ ...row, snip: null }, options.owner === true), ...(row.summary ? { summary: row.summary } : {}), ...(row.updated ? { updated: row.updated } : {}), ...(row.published ? { published: row.published } : {}),
			extra: json(row.extra, {}), links: json<string[]>(row.links, []), text, from, ...(row.text_from ? { textFrom: row.text_from as 'source' | 'page' } : {}),
			allHighlights: this.highlightsOf(row.source, row.id, json<SourceHighlight[]>(row.own_highlights, []))
		};
	}

	/** The channels, collections or shelves of a source, with how many documents each holds. */
	places(options: { owner: boolean; source?: string }): { source: string; place: string; count: number }[] {
		if (options.owner !== true) return [];
		return this.sql.all<{ source: string; place: string; count: number }>(
			`SELECT d.source, json_each.value AS place, count(*) AS count FROM docs d, json_each(d.places) WHERE ${options.owner === true ? '1' : 'd.private = 0'} AND (? IS NULL OR d.source = ?)
			 GROUP BY d.source, json_each.value ORDER BY count DESC LIMIT 500`, options.source ?? null, options.source ?? null
		);
	}

	stats(): SourceStats[] {
		const highlights = new Map(this.sql.all<{ source: string; count: number }>('SELECT source, count(*) AS count FROM highlights GROUP BY source').map((row) => [row.source, row.count]));
		return this.sql.all<{ source: string; documents: number; private: number; own: number; withText: number; embedded: number; newest: string | null; synced: string | null }>(
			`SELECT source, count(*) AS documents, sum(private) AS private, sum(json_array_length(own_highlights)) AS own, sum(length > 0) AS withText, sum(embedded IS NOT NULL) AS embedded, max(created) AS newest, max(synced_at) AS synced FROM docs GROUP BY source ORDER BY source`
		).map((row) => ({ source: row.source, documents: row.documents, private: row.private, highlights: row.own + (highlights.get(row.source) ?? 0), withText: row.withText, embedded: row.embedded, ...(row.newest ? { newest: row.newest } : {}), ...(row.synced ? { synced: row.synced } : {}) }));
	}

	// ------------------------------------------------------------ state

	state<T = SyncState>(key: string): T | undefined {
		const row = this.sql.all<{ value: string }>('SELECT value FROM state WHERE key = ?', key)[0];
		return row ? json<T | undefined>(row.value, undefined) : undefined;
	}

	setState(key: string, value: unknown): void {
		this.sql.all('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
	}
}
