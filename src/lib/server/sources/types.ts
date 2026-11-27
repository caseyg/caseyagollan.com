/**
 * The shared shape of everything Casey keeps in other services, and what a source has to do to be
 * part of the site's own copy of it (`index.ts`, `sync.ts`). A source is a plugin: one file in
 * `plugins/` that knows how to list what changed and turn it into `SourceDocument`s. Nothing else
 * in the cache, the search or the chat's tools knows which service a document came from.
 *
 * Adding a source: write a `SourcePlugin`, add it to `SOURCE_PLUGINS` in `registry.ts`, and give
 * the Worker its token. See `docs/sources.md`.
 */

/** A highlight Casey made in a document, with the note written beside it. */
export interface SourceHighlight {
	/** The highlight's own id at the source. */
	id: string;
	text: string;
	note?: string;
	/** ISO time it was made. */
	created?: string;
	tags?: string[];
}

/** One saved thing, the same shape whichever service keeps it. */
export interface SourceDocument {
	/** The plugin's id: `readwise`, `raindrop`, `arena`. */
	source: string;
	/** Its id at the source; `<source>:<id>` is its key here. */
	id: string;
	/** What it is, in the source's own word, lower case: article, pdf, video, link, image, book, channel… */
	kind: string;
	title: string;
	/** The page itself, on the web. */
	url: string;
	/** Where the service opens it, when that isn't the page (Reader's reading view, an Are.na block). */
	openUrl?: string;
	/** Its whole text as Markdown, when the source keeps it. */
	text?: string;
	summary?: string;
	author?: string;
	site?: string;
	image?: string;
	tags: string[];
	/** Where it is kept: channel, collection or shelf titles. */
	places: string[];
	/** ISO time Casey saved it. */
	created?: string;
	/** ISO time it last changed at the source. */
	updated?: string;
	/** ISO date the page says it was published. */
	published?: string;
	/** Only Casey may see it. Everything is private unless its plugin says otherwise. */
	private: boolean;
	/** Highlights the source keeps inside the item itself (Raindrop, Readwise books). */
	highlights?: SourceHighlight[];
	/** Addresses the text links to, as written. */
	links?: string[];
	/** What the tables use to find this item again for tagging (`raindrop:<id>`, `readwise:document:<id>`). */
	ref?: string;
	/** What Casey wrote about it at the source. */
	note?: string;
	/** Small source-specific facts worth keeping in the index: shelf, reading progress, word count. */
	extra?: Record<string, string | number | boolean>;
}

/** A document with the record the service sent, which is kept whole beside the index. */
export interface SourceRecord {
	document: SourceDocument;
	/** The service's own record, unchanged. */
	raw?: unknown;
	/** Leave the places the index already has for it: for sources that say where things are kept separately (`SyncStep.places`). */
	keepPlaces?: boolean;
}

/** A highlight that arrives on its own, apart from the document it was made in (Reader). */
export interface LooseHighlight extends SourceHighlight {
	/** The id of the document it belongs to, at the same source. */
	parent: string;
	raw?: unknown;
}

/** What a plugin remembers between steps. It is JSON, kept by the index. */
export interface SyncState {
	/** Where the pass under way has got to; absent between passes. */
	cursor?: unknown;
	/** ISO time the last finished pass started: the next pass asks for what changed after it. */
	since?: string;
	/** ISO time the last pass that listed everything started. */
	full?: string;
}

/** One bounded piece of a sync: a page or a few, never the whole source. */
export interface SyncStep {
	documents: SourceRecord[];
	highlights?: LooseHighlight[];
	/** Ids the source says are gone. */
	removed?: string[];
	/** Ids of highlights the source says are gone. */
	removedHighlights?: string[];
	/** Everything one place holds, by id: documents listed gain the place, others lose it. For sources that list places apart from items (Are.na's channels). */
	places?: { place: string; ids: string[] }[];
	/** Where to carry on; ignored when `done`. */
	cursor?: unknown;
	/** The pass is finished. */
	done: boolean;
	/** With `done`: this pass listed everything the source holds, so anything it didn't list is gone. */
	complete?: boolean;
}

export interface SyncContext {
	env: Record<string, unknown>;
	fetcher: typeof fetch;
	now: () => Date;
	/** Turns a page's HTML into Markdown. */
	markdown: (html: string, base: string) => string;
}

export interface SourcePlugin {
	id: string;
	/** The service's name as Casey reads it. */
	name: string;
	icon: string;
	/** Whether the Worker has what it needs to read this source. */
	configured(env: Record<string, unknown>): boolean;
	/**
	 * The next piece of a sync. With no `state.cursor` a pass starts: everything changed since
	 * `state.since`, or everything when that is absent. Must be safe to repeat: a step that fails
	 * is asked for again with the same state.
	 */
	sync(context: SyncContext, state: SyncState): Promise<SyncStep>;
}

export const documentKey = (source: string, id: string) => `${source}:${id}`;

/** A service asked to slow down: the step is tried again later, not counted as a failure. */
export class SourceBusy extends Error {
	constructor(public readonly source: string, public readonly retryAfter = 60) { super(`${source} is rate-limiting`); }
}
