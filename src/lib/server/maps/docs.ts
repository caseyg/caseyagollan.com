/**
 * Stage one of a map: the documents. Each source hands over what it keeps (Reader's whole text
 * and highlights, an Are.na channel's blocks, a Raindrop collection, the site's own posts) in one
 * shape, `MapDoc`; documents a source gave too little of are read from the web once and kept.
 * Reader is asked only for what changed since the last run of the same map.
 */
import { readableMarkdown } from '../chat/fetch-page';
import { daysBefore, loadAgentIndex, localDate, OWN_TYPES } from '../chat/site-search';
import { readerDocuments, savedAll, SavesError, type ReaderDocument, type SavedItem, type SavesDeps } from '../saves';
import type { PublicFetcher } from '../publishing/public-fetch';
import { POST_ICON, type Block } from '../../tables';
import { SOURCE_POST_TYPES } from '../../table-post-source';
import { picturesIn, readPage, TEXT_MAX, videoStill, type ReadPage } from './page';
import { hostOf, linksIn, normalUrl } from './text';
import { MAP_SOURCE_NAME, type DocsStage, type MapAsk, type MapDoc } from './types';

export interface DocsDeps {
	saves: SavesDeps;
	origin: string;
	assets?: Pick<Fetcher, 'fetch'>;
	/** The web, for pages read to fill a document in. */
	pageFetch?: PublicFetcher;
	now: Date;
	timeZone: string;
}

/** The most documents one map holds: past this a graph stops being readable, and a table gets heavy. */
export const MAP_MAX = 150;
/** Pages read from the web in one run to fill thin documents in; the rest wait for the next. */
export const FILL_MAX = 60;
/** Text shorter than this is a teaser, not the document. */
const THIN = 600;

const flat = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const webUrl = (value: unknown) => (typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined);
const SHELF = /^(inbox|new|later|shortlist|archive|feed)$/i;

function readerDoc(document: ReaderDocument, highlights: string[]): MapDoc {
	const url = webUrl(document.source_url) ?? document.url ?? `https://read.readwise.io/read/${document.id}`;
	// A transcript is a run of timed spans with no spaces between them: give each its space, or words run together.
	const html = document.category === 'video' || document.category === 'podcast' ? document.html_content?.replace(/<\/span>\s*<span/g, '</span> <span') : document.html_content;
	const text = html ? readableMarkdown(html, url).replace(/ {2,}/g, ' ').slice(0, TEXT_MAX) : flat(document.content) || flat(document.summary);
	const images = [webUrl(document.image_url), videoStill(url), ...picturesIn(text)].filter((src): src is string => !!src && src.startsWith('https:'));
	return {
		id: `readwise:${document.id}`, source: 'readwise', url, title: flat(document.title) || hostOf(url) || 'Untitled', site: flat(document.site_name) || hostOf(url),
		...(flat(document.author) ? { author: flat(document.author) } : {}), date: (document.saved_at ?? document.created_at)?.slice(0, 10), kind: document.category ?? 'document',
		text, links: [...new Set(linksIn(text))].slice(0, 400), images: [...new Set(images)].slice(0, 5), highlights,
		...(/^[0-9a-z]{20,40}$/.test(document.id) ? { ref: `readwise:document:${document.id}` } : {}), updated: document.updated_at
	};
}

async function readwiseDocs(ask: MapAsk, since: string | undefined, deps: DocsDeps, before: MapDoc[], fetched?: string): Promise<{ docs: MapDoc[]; note?: string }> {
	const place = ask.in?.trim();
	const tag = /^tag:\s*(.+)$/i.exec(place ?? '')?.[1];
	if (place && !tag && !SHELF.test(place)) throw new SavesError('For a map, Readwise takes a shelf (inbox, later, shortlist, archive, feed) or tag:<name> as `in`, or just `days`.');
	if (!since && !place) throw new SavesError('Give `days` (how far back) or a shelf or tag as `in`: Reader holds thousands of documents.');
	// Only what changed since this map was last read, with a few minutes' overlap for clocks.
	const from = since && fetched && fetched > since ? new Date(Date.parse(fetched) - 600_000).toISOString() : since;
	const { documents, more } = await readerDocuments(deps.saves, { since: from, ...(tag ? { tag } : place ? { location: place } : {}), max: MAP_MAX * 2 });
	const marked = new Map<string, string[]>();
	for (const child of documents.toSorted((a, b) => (a.saved_at ?? '').localeCompare(b.saved_at ?? ''))) {
		if (!child.parent_id || child.category !== 'highlight' || !flat(child.content)) continue;
		marked.set(child.parent_id, [...(marked.get(child.parent_id) ?? []), flat(child.content)]);
	}
	const fresh = documents.filter((document) => !document.parent_id && (place?.toLowerCase() === 'feed' || document.location !== 'feed')).map((document) => readerDoc(document, marked.get(document.id) ?? []));
	const byId = new Map(before.filter((doc) => doc.source === 'readwise').map((doc) => [doc.id, doc]));
	for (const doc of fresh) {
		const old = byId.get(doc.id);
		// What was read from the web for it last time still holds; highlights only ever add.
		byId.set(doc.id, old ? { ...doc, highlights: [...new Set([...old.highlights, ...doc.highlights])], ...(old.filled ? { filled: true, text: doc.text.length >= old.text.length ? doc.text : old.text, links: doc.links.length ? doc.links : old.links, images: [...new Set([...doc.images, ...old.images])].slice(0, 5) } : {}) } : doc);
	}
	const day = since?.slice(0, 10);
	const docs = [...byId.values()].filter((doc) => !day || !doc.date || doc.date >= day).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
	return { docs, ...(more ? { note: 'Readwise had more than this map takes; the newest were kept.' } : {}) };
}

function savedDoc(source: 'arena' | 'raindrop', item: SavedItem): MapDoc | null {
	if (!item.block || item.kind === 'channel') return null;
	const page = source === 'arena' ? webUrl(item.source) : webUrl(item.url);
	const url = page ?? item.url;
	const text = flat(item.text);
	return {
		id: `${source}:${item.id}`, source, url, ...(page && page !== item.url ? { open: item.url } : {}), title: item.title, site: hostOf(url), date: item.date, kind: item.kind,
		text, links: [...new Set(linksIn(text))], images: [item.image, videoStill(url)].filter((src): src is string => !!src && src.startsWith('https:')), highlights: item.highlights ?? [],
		...(item.block.ref ? { ref: item.block.ref } : {}), ...(item.private ? { private: true } : {}),
		// Are.na is drawn as Are.na draws it; a bookmark becomes a card like any other page.
		...(source === 'arena' ? { block: item.block } : {}),
		// An Are.na picture or note is whole as it is: there is no page behind it to read.
		...(source === 'arena' && !page ? { filled: true } : {})
	};
}

async function savedDocs(source: 'arena' | 'raindrop', ask: MapAsk, since: string | undefined, deps: DocsDeps): Promise<{ docs: MapDoc[]; note?: string }> {
	const place = ask.in?.trim() || (source === 'raindrop' ? 'all' : '');
	if (!place && !ask.query) throw new SavesError('Are.na needs a channel as `in` (my_saves lists them).');
	const page = await savedAll(deps.saves, source, { in: place || undefined, query: ask.query }, MAP_MAX);
	const day = since?.slice(0, 10);
	const docs = page.items.map((item) => savedDoc(source, item)).filter((doc): doc is MapDoc => !!doc && (!day || !doc.date || doc.date >= day));
	const total = page.total ?? page.items.length;
	return { docs, ...(page.more || total > page.items.length ? { note: `${MAP_SOURCE_NAME[source]}${page.place ? ` “${page.place.title}”` : ''} holds ${total}; the first ${page.items.length} were read.` } : {}) };
}

/** The site's own posts: all of Casey's kinds, or one kind or tag given as `in`. */
async function siteDocs(ask: MapAsk, since: string | undefined, deps: DocsDeps): Promise<{ docs: MapDoc[]; note?: string }> {
	const index = await loadAgentIndex(deps.assets, deps.origin);
	const place = ask.in?.trim().toLowerCase().replace(/^#/, '');
	const kind = place?.replace(/^type:\s*/, '').replace(/ies$/, 'y').replace(/s$/, '');
	const types = !place || kind === 'post' ? OWN_TYPES : (['like', 'repost', ...OWN_TYPES].includes(kind!) ? [kind!] : undefined);
	const tag = !types ? place!.replace(/^tag:\s*/, '') : undefined;
	const words = ask.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
	const day = since?.slice(0, 10);
	if (!day && !place && !words.length) throw new SavesError('Give `days`, a kind or tag as `in`, or `query`: the site has thousands of posts.');
	const found = index.filter((doc) => (types ? types.includes(doc.y) : [...OWN_TYPES, 'like', 'repost'].includes(doc.y) && (doc.g ?? '').toLowerCase().split(/,\s*/).includes(tag!))
		&& (!day || (!!doc.d && doc.d >= day)) && words.every((word) => `${doc.t} ${doc.x}`.toLowerCase().includes(word)))
		.sort((a, b) => (b.d ?? '').localeCompare(a.d ?? ''));
	const docs = found.slice(0, MAP_MAX).map((doc): MapDoc => {
		const native = SOURCE_POST_TYPES.has(doc.y);
		const block: Block = { kind: 'post', url: doc.u, title: doc.t, meta: [doc.y, doc.d].filter(Boolean).join(' · '), excerpt: doc.x.slice(0, 300) || undefined, icon: POST_ICON[doc.y] };
		return {
			id: `site:${doc.u}`, source: 'site', url: new URL(doc.u, 'https://caseyagollan.com').href, open: doc.u, title: doc.t, site: 'caseyagollan.com', date: doc.d, kind: doc.y,
			text: doc.x, links: [], images: [], highlights: [],
			// Notes, replies, likes and reposts are drawn as the posts they are.
			...(native ? { block } : {})
		};
	});
	return { docs, ...(found.length > docs.length ? { note: `The site has ${found.length} such posts; the newest ${docs.length} were read.` } : {}) };
}

const needsFill = (doc: MapDoc) => !doc.filled && !doc.private && /^https:/.test(doc.url) && !/^read\.readwise\.io$/.test(hostOf(doc.url)) && (doc.text.length < THIN || (!doc.images.length && !doc.block) || (doc.source !== 'readwise' && !doc.links.length));

/** Reads thin documents from the web, a few at a time, and folds in what the page has that the source lacked. */
export async function fillDocs(docs: MapDoc[], deps: DocsDeps, read: (url: string) => Promise<ReadPage> = (url) => readPage(url, { origin: deps.origin, assets: deps.assets, fetcher: deps.pageFetch })): Promise<{ filled: number; failed: number; waiting: number }> {
	const thin = docs.filter(needsFill);
	const now = thin.slice(0, FILL_MAX);
	let filled = 0, failed = 0, next = 0;
	const worker = async () => {
		for (;;) {
			const doc = now[next++];
			if (!doc) return;
			try {
				const page = await read(doc.source === 'site' ? doc.open! : doc.url);
				if (page.text.length > doc.text.length) doc.text = page.text;
				doc.links = [...new Set([...doc.links, ...page.links])].slice(0, 400);
				doc.images = [...new Set([...doc.images, ...page.images])].slice(0, 5);
				if (!doc.site || doc.site === hostOf(doc.url)) doc.site = page.site || doc.site;
				if (!doc.author && page.author) doc.author = page.author;
				filled++;
			} catch { failed++; }
			// Read once, whatever came of it: a page that refuses today is not asked on every run.
			doc.filled = true;
		}
	};
	await Promise.all(Array.from({ length: 6 }, worker));
	return { filled, failed, waiting: thin.length - now.length };
}

export const sameAsks = (a: MapAsk[], b: MapAsk[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The documents for a map of `asks`, saved in the last `days` when given. `before` is the same
 * map's last run: Reader is then asked only for what changed since, and pages already read from
 * the web are not read again. The same page saved in two places appears once.
 */
export async function loadDocs(asks: MapAsk[], days: number | undefined, deps: DocsDeps, before?: DocsStage): Promise<DocsStage & { read: { filled: number; failed: number; waiting: number } }> {
	const sinceFor = (span: number | undefined) => (span ? `${daysBefore(localDate(deps.now, deps.timeZone), Math.max(0, span - 1))}T00:00:00Z` : undefined);
	const reuse = before && !before.partial && sameAsks(before.asks, asks) && before.days === days ? before : undefined;
	let partial = false;
	const old = new Map((reuse?.docs ?? []).map((doc) => [doc.id, doc]));
	const fetched = deps.now.toISOString();
	const notes: string[] = [];
	const docs: MapDoc[] = [];
	const seen = new Set<string>(), pages = new Set<string>();
	for (const ask of asks) {
		const span = ask.days ?? days, since = sinceFor(span);
		let got: { docs: MapDoc[]; note?: string };
		try {
			got = ask.source === 'readwise' ? await readwiseDocs(ask, since, deps, reuse?.docs ?? [], reuse?.fetched)
				: ask.source === 'site' ? await siteDocs(ask, since, deps)
				: await savedDocs(ask.source, ask, since, deps);
		} catch (error) {
			// One source being down leaves the others their map.
			notes.push(`${MAP_SOURCE_NAME[ask.source]}${ask.in ? ` “${ask.in}”` : ''} couldn’t be read: ${error instanceof SavesError ? error.message : 'it didn’t answer just now.'}`);
			partial = true;
			continue;
		}
		if (got.note) notes.push(got.note);
		if (!got.docs.length) notes.push(`${MAP_SOURCE_NAME[ask.source]}${ask.in ? ` “${ask.in}”` : ''} had nothing${span ? ` saved in the last ${span} days` : ''}.`);
		for (const doc of got.docs) {
			const page = normalUrl(doc.url) ?? doc.id;
			if (seen.has(doc.id) || pages.has(page)) continue;
			seen.add(doc.id);
			pages.add(page);
			const was = old.get(doc.id);
			docs.push(was?.filled && doc.source !== 'readwise' ? { ...doc, filled: true, text: was.text.length > doc.text.length ? was.text : doc.text, links: [...new Set([...doc.links, ...was.links])], images: [...new Set([...doc.images, ...was.images])].slice(0, 5), site: was.site || doc.site } : doc);
		}
	}
	const kept = docs.slice(0, MAP_MAX);
	if (docs.length > kept.length) notes.push(`${docs.length} documents in all; a map holds ${MAP_MAX}, so the rest were left out. Narrow it with fewer days or one place.`);
	const read = await fillDocs(kept, deps);
	if (read.waiting) notes.push(`${read.waiting} documents still have only a line of text: run the map again to read their pages.`);
	return { asks, ...(days ? { days } : {}), fetched, docs: kept, notes, ...(partial ? { partial } : {}), read };
}
