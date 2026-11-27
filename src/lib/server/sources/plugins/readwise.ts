/**
 * Readwise: every document in Reader's inbox, later, shortlist and archive with its whole text
 * and metadata, the highlights made in them, and what Casey highlighted elsewhere (Kindle and the
 * like, from the Readwise export). Reader's feed is left out: it is what Casey subscribes to, not
 * what Casey saved.
 *
 * A pass walks a list of sub-passes, a page a step. Reader's list answers "changed after" for
 * each, so after the first pass a sync is a handful of requests. Reader does not say what was
 * deleted, so a document deleted there stays here.
 */
import { flat, getJson, host, iso, linksIn, plainText, secret, webUrl } from './http';
import type { LooseHighlight, SourceDocument, SourcePlugin, SourceRecord, SyncStep } from '../types';

const API = 'https://readwise.io/api';
/** Reader's shelves by the API's names, and the names its interface uses. */
const SHELVES: [string, string][] = [['new', 'Inbox'], ['later', 'Later'], ['shortlist', 'Shortlist'], ['archive', 'Archive']];
/** After the shelves: highlights made in Reader, then the export of everything highlighted elsewhere. */
const PASSES = [...SHELVES.map(([location]) => `shelf:${location}`), 'highlights', 'export'];
/**
 * Documents a page. Each carries its whole HTML, and the Worker's memory (128 MB, much of it taken by the
 * site's own code) is shared with whatever else the page needs, so pages are kept small.
 */
const PAGE = 20;
/** After a step that never finished: fewer at a time, and their words taken without building each page's document. */
const CAUTIOUS_PAGE = 5;
/** HTML longer than this is never parsed whole: a document that size can take more memory than the Worker has. */
const PARSE_LIMIT = 150_000;

interface Cursor { pass: number; page?: string; seen?: number }
const LABELS = [...SHELVES.map(([, name]) => name), 'Highlights', 'Highlights from elsewhere'];

export interface ReaderRecord {
	id: string; url?: string; source_url?: string | null; title?: string | null; author?: string | null; source?: string | null; category?: string; location?: string | null;
	tags?: Record<string, { name?: string } | null> | null; site_name?: string | null; word_count?: number | null; reading_time?: string | null; created_at?: string; updated_at?: string;
	published_date?: string | number | null; summary?: string | null; image_url?: string | null; content?: string | null; html_content?: string | null; notes?: string | null;
	parent_id?: string | null; reading_progress?: number | null; saved_at?: string; last_moved_at?: string | null; first_opened_at?: string | null; last_opened_at?: string | null;
}

interface ExportHighlight { id: number; is_deleted?: boolean; text?: string; note?: string | null; highlighted_at?: string | null; created_at?: string | null; tags?: { name?: string }[] | null }
interface ExportBook {
	user_book_id: number; is_deleted?: boolean; title?: string | null; readable_title?: string | null; author?: string | null; source?: string | null; cover_image_url?: string | null;
	unique_url?: string | null; summary?: string | null; book_tags?: { name?: string }[] | null; category?: string | null; document_note?: string | null; readwise_url?: string | null;
	source_url?: string | null; asin?: string | null; highlights?: ExportHighlight[] | null;
}

const tagNames = (tags: ReaderRecord['tags']) => Object.entries(tags ?? {}).map(([key, tag]) => tag?.name || key).filter(Boolean);

/** A Reader document in the shared shape. `markdown` turns its HTML into the text that is kept. */
export function readerDocument(record: ReaderRecord, markdown: (html: string, base: string) => string): SourceDocument {
	const open = record.url || `https://read.readwise.io/read/${record.id}`;
	const url = webUrl(record.source_url) ?? open;
	const shelf = SHELVES.find(([location]) => location === record.location)?.[1];
	const text = record.html_content ? markdown(record.html_content, url) : flat(record.content);
	const published = typeof record.published_date === 'number' ? new Date(record.published_date).toISOString().slice(0, 10) : flat(record.published_date) || undefined;
	return {
		source: 'readwise', id: record.id, kind: flat(record.category) || 'article', title: flat(record.title) || host(url) || 'Untitled', url, ...(open !== url ? { openUrl: open } : {}),
		...(text ? { text, links: linksIn(text) } : {}), ...(flat(record.summary) ? { summary: flat(record.summary) } : {}), ...(flat(record.author) ? { author: flat(record.author) } : {}),
		site: flat(record.site_name) || host(url), ...(webUrl(record.image_url) ? { image: webUrl(record.image_url) } : {}), tags: tagNames(record.tags), places: shelf ? [shelf] : [],
		created: iso(record.saved_at ?? record.created_at), updated: iso(record.updated_at), ...(published ? { published } : {}), private: true,
		...(flat(record.notes) ? { note: flat(record.notes) } : {}), ref: `readwise:document:${record.id}`,
		extra: {
			...(typeof record.word_count === 'number' ? { words: record.word_count } : {}), ...(typeof record.reading_progress === 'number' ? { progress: Math.round(record.reading_progress * 100) / 100 } : {}),
			...(flat(record.reading_time) ? { readingTime: flat(record.reading_time) } : {}), ...(flat(record.source) ? { savedWith: flat(record.source) } : {}),
			...(iso(record.last_opened_at) ? { opened: iso(record.last_opened_at)! } : {})
		}
	};
}

const bookId = (id: number) => `book:${id}`;

/** Something highlighted outside Reader (a Kindle book, a podcast), from the export. Its highlights travel separately, since the export sends only the changed ones. */
export function exportDocument(book: ExportBook): SourceDocument {
	const open = webUrl(book.readwise_url) ?? `https://readwise.io/bookreview/${book.user_book_id}`;
	const url = webUrl(book.source_url) ?? webUrl(book.unique_url) ?? open;
	const made = (book.highlights ?? []).map((highlight) => iso(highlight.highlighted_at ?? highlight.created_at)).filter((time): time is string => !!time).sort();
	return {
		source: 'readwise', id: bookId(book.user_book_id), kind: flat(book.category).replace(/s$/, '') || 'book', title: flat(book.readable_title) || flat(book.title) || 'Untitled', url,
		...(open !== url ? { openUrl: open } : {}), ...(flat(book.summary) ? { summary: flat(book.summary) } : {}), ...(flat(book.author) ? { author: flat(book.author).replace(/^By\s+/i, '') } : {}),
		...(webUrl(book.cover_image_url) ? { image: webUrl(book.cover_image_url) } : {}), tags: (book.book_tags ?? []).map((tag) => flat(tag.name)).filter(Boolean), places: ['Highlights'],
		...(made.length ? { created: made[0], updated: made[made.length - 1] } : {}), private: true, ...(flat(book.document_note) ? { note: flat(book.document_note) } : {}),
		ref: `readwise:book:${book.user_book_id}`, extra: { ...(flat(book.source) ? { savedWith: flat(book.source) } : {}), ...(flat(book.asin) ? { asin: flat(book.asin) } : {}) }
	};
}

export const readwise: SourcePlugin = {
	id: 'readwise',
	name: 'Readwise',
	icon: '📖',
	configured: (env) => !!secret(env, 'READWISE_ACCESS_TOKEN'),
	async sync(context, state): Promise<SyncStep> {
		const headers = { authorization: `Token ${secret(context.env, 'READWISE_ACCESS_TOKEN')}` };
		const cursor = (state.cursor as Cursor | undefined) ?? { pass: 0 };
		const pass = PASSES[cursor.pass];
		const next = (page: string | null | undefined, got = 0, total?: number | null): Pick<SyncStep, 'cursor' | 'done' | 'progress'> => {
			const seen = (cursor.seen ?? 0) + got;
			const progress = { label: LABELS[cursor.pass], part: cursor.pass, parts: PASSES.length, done: seen, ...(typeof total === 'number' ? { total: Math.max(total, seen) } : {}) };
			return page ? { cursor: { pass: cursor.pass, page, seen }, done: false, progress } : cursor.pass + 1 < PASSES.length ? { cursor: { pass: cursor.pass + 1 }, done: false, progress: { ...progress, total: seen } } : { done: true };
		};

		if (pass === 'export') {
			const params = new URLSearchParams();
			if (state.since) params.set('updatedAfter', state.since);
			if (cursor.page) params.set('pageCursor', cursor.page);
			const data = await getJson<{ count?: number | null; results?: ExportBook[]; nextPageCursor?: string | number | null }>(context, 'Readwise', `${API}/v2/export/?${params}`, headers);
			// Whatever was highlighted in Reader is already here as a Reader document with its highlights.
			const books = (data.results ?? []).filter((book) => book.source !== 'reader');
			const documents: SourceRecord[] = [], highlights: LooseHighlight[] = [], removed: string[] = [], removedHighlights: string[] = [];
			for (const book of books) {
				if (book.is_deleted) { removed.push(bookId(book.user_book_id)); continue; }
				documents.push({ document: exportDocument(book), raw: book });
				for (const highlight of book.highlights ?? []) {
					if (highlight.is_deleted || !flat(highlight.text)) { removedHighlights.push(`v2:${highlight.id}`); continue; }
					highlights.push({
						id: `v2:${highlight.id}`, parent: bookId(book.user_book_id), text: String(highlight.text).trim(), ...(flat(highlight.note) ? { note: flat(highlight.note) } : {}),
						created: iso(highlight.highlighted_at ?? highlight.created_at), tags: (highlight.tags ?? []).map((tag) => flat(tag.name)).filter(Boolean)
					});
				}
			}
			return { documents, highlights, removed, removedHighlights, ...next(data.nextPageCursor ? String(data.nextPageCursor) : null, (data.results ?? []).length, data.count) };
		}

		const params = new URLSearchParams({ limit: String(!state.cautious ? PAGE : (state.tries ?? 1) > 1 ? 1 : CAUTIOUS_PAGE) });
		if (pass === 'highlights') params.set('category', 'highlight');
		else { params.set('location', pass.slice('shelf:'.length)); params.set('withHtmlContent', 'true'); }
		if (state.since) params.set('updatedAfter', state.since);
		if (cursor.page) params.set('pageCursor', cursor.page);
		const data = await getJson<{ count?: number | null; results?: ReaderRecord[]; nextPageCursor?: string | null }>(context, 'Readwise', `${API}/v3/list/?${params}`, headers);
		const records = data.results ?? [];
		if (pass === 'highlights') {
			const highlights = records.filter((record) => record.parent_id && flat(record.content)).map((record): LooseHighlight => ({
				id: record.id, parent: record.parent_id!, text: String(record.content).trim(), ...(flat(record.notes) ? { note: flat(record.notes) } : {}),
				created: iso(record.created_at), tags: tagNames(record.tags), raw: record
			}));
			return { documents: [], highlights, ...next(data.nextPageCursor, records.length, data.count) };
		}
		const documents = records.filter((record) => !record.parent_id).map((record) => ({ document: readerDocument(record, (html, base) => (state.cautious || html.length > PARSE_LIMIT ? plainText(html) : context.markdown(html, base))), raw: record }));
		return { documents, ...next(data.nextPageCursor, records.length, data.count) };
	}
};
