/**
 * A map of saved things, built in stages with a JSON file between each: `docs` (what was saved,
 * its text, links and pictures), `links` (the ties), `quotes`, `images`, and `graph` (the cards
 * and where they go). The files live in private storage under the map's key, so a later run reads
 * only what changed, and a stage can be done again alone (`redo`) when its quotes or its layout
 * need fixing, without fetching anything twice. Sources are whatever mix was asked for.
 */
import { addressHash } from '../screenshot';
import type { SavesDeps } from '../saves';
import type { PublicFetcher } from '../publishing/public-fetch';
import { loadDocs, type DocsDeps } from './docs';
import { buildEdges } from './edges';
import { buildGraph } from './graph';
import { pickImages } from './images';
import type { MapModel } from './model';
import { pickQuotes } from './quotes';
import { MAP_SOURCE_NAME, type DocsStage, type GraphStage, type ImagesStage, type LinksStage, type MapAsk, type QuotesStage } from './types';

export const MAP_STAGES = ['docs', 'links', 'quotes', 'images', 'graph'] as const;
export type MapStage = (typeof MAP_STAGES)[number];

export interface MapRequest {
	asks: MapAsk[];
	/** Only what was saved in the last so many days. */
	days?: number;
	/** Stages to do again from scratch. Without `docs` among them, nothing is fetched from the sources. */
	redo?: MapStage[];
	/** The most likeness ties a document asks for (0 to 6). */
	similar?: number;
	/** How much air the layout leaves: 1 is usual, 2 is twice the room between joined cards. */
	spread?: number;
}

export interface MapDeps {
	saves: SavesDeps;
	origin: string;
	assets?: Pick<Fetcher, 'fetch'>;
	/** Where stage files are kept (`PUBLISHING_STATE`). Without it every stage runs each time. */
	state?: R2Bucket;
	/** Where mirrored pictures are kept (`SCREENSHOTS`). */
	pictures?: R2Bucket;
	images?: ImagesBinding;
	model?: MapModel;
	pageFetch?: PublicFetcher;
	imageFetch?: PublicFetcher;
	now: Date;
	timeZone: string;
}

export interface BuiltMap {
	key: string;
	docs: DocsStage;
	links: LinksStage;
	quotes: QuotesStage;
	images: ImagesStage;
	graph: GraphStage;
	/** Which stages did work this time, and which were read back as they were. */
	ran: MapStage[];
}

const PREFIX = 'private/chat/maps';

/** The same sources, places and days are the same map, whatever order they were named in. */
export async function mapKey(request: Pick<MapRequest, 'asks' | 'days'>): Promise<string> {
	const asks = request.asks.map((ask) => `${ask.source}|${(ask.in ?? '').trim().toLowerCase()}|${(ask.query ?? '').trim().toLowerCase()}`).sort();
	return (await addressHash(JSON.stringify([asks, request.days ?? 0]))).slice(0, 16);
}

/** A short fingerprint of what a stage was made from: the same input, the same file. */
function sign(value: unknown): string {
	const text = JSON.stringify(value);
	let a = 0x811c9dc5, b = 0x9747b28c;
	for (let index = 0; index < text.length; index++) { const code = text.charCodeAt(index); a = Math.imul(a ^ code, 0x01000193); b = Math.imul(b ^ code, 0x5bd1e995) ^ (b >>> 13); }
	return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

async function read<T>(bucket: R2Bucket | undefined, key: string, stage: MapStage): Promise<(T & { input?: string }) | undefined> {
	try { return (await (await bucket?.get(`${PREFIX}/${key}/${stage}.json`))?.json()) as (T & { input?: string }) | undefined; } catch { return undefined; }
}
const write = (bucket: R2Bucket | undefined, key: string, stage: MapStage, value: unknown) =>
	bucket?.put(`${PREFIX}/${key}/${stage}.json`, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } }).catch(() => undefined);

export async function buildMap(request: MapRequest, deps: MapDeps): Promise<BuiltMap> {
	const asks = request.asks.map((ask) => ({ source: ask.source, ...(ask.in?.trim() ? { in: ask.in.trim() } : {}), ...(ask.query?.trim() ? { query: ask.query.trim() } : {}) }));
	const key = await mapKey({ asks, days: request.days });
	const redo = new Set(request.redo ?? []);
	const ran: MapStage[] = [];
	const docsDeps: DocsDeps = { saves: deps.saves, origin: deps.origin, assets: deps.assets, pageFetch: deps.pageFetch, now: deps.now, timeZone: deps.timeZone };

	// Docs: read again each run (a delta, for Reader), unless only later stages were asked to be redone.
	const before = await read<DocsStage>(deps.state, key, 'docs');
	let docs: DocsStage;
	if (before && redo.size && !redo.has('docs')) docs = before;
	else {
		const { read: _read, ...loaded } = await loadDocs(asks, request.days, docsDeps, redo.has('docs') ? undefined : before);
		docs = loaded;
		ran.push('docs');
		await write(deps.state, key, 'docs', docs);
	}

	const similar = request.similar ?? 3;
	const linksInput = sign([docs.docs.map((doc) => [doc.id, doc.url, doc.title, doc.text.length, doc.links.length]), similar]);
	let links = redo.has('links') ? undefined : await read<LinksStage>(deps.state, key, 'links');
	if (!links || links.input !== linksInput) {
		links = { ...buildEdges(docs.docs, { similar }), input: linksInput } as LinksStage & { input: string };
		ran.push('links');
		await write(deps.state, key, 'links', links);
	}

	// Quotes and pictures keep what they chose for documents that haven't changed.
	const quotesBefore = redo.has('quotes') ? undefined : await read<QuotesStage>(deps.state, key, 'quotes');
	const quotesInput = sign(docs.docs.map((doc) => [doc.id, doc.text.length, doc.highlights]));
	let quotes = quotesBefore;
	if (!quotes || quotes.input !== quotesInput) {
		quotes = { ...(await pickQuotes(docs.docs.filter((doc) => !doc.block), deps.model?.choose, quotesBefore?.quotes)), input: quotesInput } as QuotesStage & { input: string };
		ran.push('quotes');
		await write(deps.state, key, 'quotes', quotes);
	}

	const imagesBefore = redo.has('images') ? undefined : await read<ImagesStage>(deps.state, key, 'images');
	const imagesInput = sign(docs.docs.map((doc) => [doc.id, doc.images, !!doc.block]));
	let images = imagesBefore;
	// Pictures nobody could check are tried again next time.
	if (!images || images.input !== imagesInput || images.unchecked) {
		images = { ...(await pickImages(docs.docs, { bucket: deps.pictures, images: deps.images, fetcher: deps.imageFetch, look: deps.model?.look }, imagesBefore?.images)), input: imagesInput } as ImagesStage & { input: string };
		ran.push('images');
		await write(deps.state, key, 'images', images);
	}

	const spread = request.spread ?? 1;
	const graphInput = sign([links.edges, quotes.quotes, images.images, docs.docs.map((doc) => [doc.id, doc.title]), spread]);
	let graph = redo.has('graph') ? undefined : await read<GraphStage>(deps.state, key, 'graph');
	if (!graph || graph.input !== graphInput) {
		graph = { ...buildGraph(docs.docs, links.edges, quotes.quotes, images.images, { spread }), input: graphInput } as GraphStage & { input: string };
		ran.push('graph');
		await write(deps.state, key, 'graph', graph);
	}
	return { key, docs, links, quotes, images, graph, ran };
}

/** A map's name when none was given: its sources, and how far back it looks. */
export function mapName(request: Pick<MapRequest, 'asks' | 'days'>): string {
	const names = [...new Set(request.asks.map((ask) => (ask.in && ask.source !== 'readwise' ? ask.in.replace(/^tag:\s*/i, '#') : MAP_SOURCE_NAME[ask.source])))];
	const from = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ');
	const when = request.days === 7 ? 'This week in ' : request.days === 1 ? 'Today in ' : request.days ? `${request.days} days of ` : '';
	return `${when}${from}`.slice(0, 120);
}
