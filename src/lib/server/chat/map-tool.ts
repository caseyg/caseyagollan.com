/**
 * The /chat assistant's `table_map` (Casey's runs only): everything saved to one or more sources,
 * as a network on a table, in one call. The work is the staged pipeline in `$lib/server/maps`
 * (docs, links, quotes, images, graph), run here on the server with a JSON file kept between
 * stages; the table page only draws the finished cards and lines (`add_map`). The model chooses
 * the sources and the days, never a position: where things go is the layout's to work out.
 *
 * Asked again for the same sources and days, it reads only what changed and replaces the map
 * where it stands. `redo` does chosen stages again from what is kept (`graph` with another
 * `spread`, `quotes`, `images`), so fixing one thing doesn't fetch everything twice.
 */
import type { ToolRegistration } from '@earendil-works/pi-durable';
import type { TableOp } from '../../table-agent';
import { buildMap, MAP_STAGES, mapName, type MapDeps, type MapStage } from '../maps/pipeline';
import { mapModel, type MapModelEnv } from '../maps/model';
import { MAP_SOURCES, MAP_SOURCE_NAME, type MapAsk, type MapSource } from '../maps/types';
import type { SavesDeps } from '../saves';

/** The most places one map draws from. */
export const MAP_ASKS_MAX = 6;

export interface MapToolDeps {
	env: MapModelEnv & { ASSETS?: Pick<Fetcher, 'fetch'>; IMAGES?: ImagesBinding; SCREENSHOTS?: R2Bucket; PUBLISHING_STATE?: R2Bucket };
	origin(): string;
	saves(): SavesDeps;
	/** The table open beside the chat, if one is. */
	table(): string | undefined;
	/** A new draft table, opened in Casey's browser. */
	makeTable(name: string): Promise<{ url: string; open: boolean }>;
	run(op: TableOp): Promise<Record<string, unknown>>;
	now(): Date;
	timeZone: string;
	/** In place of the pipeline's own reach, for tests and replays. */
	overrides?: Partial<Pick<MapDeps, 'model' | 'pageFetch' | 'imageFetch' | 'state' | 'pictures'>>;
}

const said = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const clip = (value: string, limit: number) => (value.length <= limit ? value : `${value.slice(0, limit).trimEnd()}…`);
const SOURCE_WORDS: [RegExp, MapSource][] = [[/readwise|reader/i, 'readwise'], [/are\.?na/i, 'arena'], [/raindrop|bookmark/i, 'raindrop'], [/site|post|blog/i, 'site']];

/** The places asked for, however the model wrote them: objects, bare names, or "all". */
export function mapAsks(value: unknown): MapAsk[] {
	const list = Array.isArray(value) ? value : value ? [value] : [];
	const asks: MapAsk[] = [];
	for (const one of list) {
		const named = typeof one === 'string' ? one : said((one as { source?: unknown } | null)?.source) ?? '';
		if (/^(all|everything|any)$/i.test(named.trim())) { for (const source of MAP_SOURCES) asks.push({ source }); continue; }
		const source = MAP_SOURCES.find((known) => known === named.trim().toLowerCase()) ?? SOURCE_WORDS.find(([words]) => words.test(named))?.[1];
		if (!source) continue;
		const from = typeof one === 'object' && one ? (one as { in?: unknown; query?: unknown; days?: unknown }) : {};
		const own = typeof from.days === 'number' && Number.isFinite(from.days) && from.days >= 0 ? Math.min(366, Math.round(from.days)) : undefined;
		asks.push({ source, ...(said(from.in) ? { in: said(from.in) } : {}), ...(said(from.query) ? { query: said(from.query) } : {}), ...(own !== undefined ? { days: own } : {}) });
	}
	const seen = new Set<string>();
	return asks.filter((ask) => { const key = `${ask.source}|${ask.in ?? ''}|${ask.query ?? ''}|${ask.days ?? ''}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, MAP_ASKS_MAX);
}

export function mapTool(deps: MapToolDeps): ToolRegistration {
	return {
		name: 'table_map',
		description: 'Map what Casey saved, as a network on a table, in one call: everything from one or more sources over some days becomes a card with its picture and best quote, tied by links and shared citations (solid lines) and by likeness (dotted), laid out so clusters show. Makes the table when none is open; the same sources again update the map in place.',
		parameters: {
			type: 'object',
			properties: {
				sources: {
					type: 'array', maxItems: MAP_ASKS_MAX,
					items: { type: 'object', properties: { source: { type: 'string', enum: [...MAP_SOURCES, 'all'] }, in: { type: 'string', description: 'A channel, collection, shelf or tag in it.' }, query: { type: 'string' }, days: { type: 'integer', description: 'Its own window, over `days`; 0 for the whole of that place.' } }, required: ['source'] },
					description: 'Where from, mixed freely; `site` is Casey’s own posts.'
				},
				days: { type: 'integer', minimum: 1, maximum: 366, description: 'Saved in the last so many days: 7 for “this week”.' },
				name: { type: 'string', maxLength: 120 },
				redo: { type: 'array', items: { type: 'string', enum: [...MAP_STAGES] }, description: 'Stages to do again from what is kept: ["graph"] for another layout, ["quotes"], ["images"].' },
				similar: { type: 'integer', minimum: 0, maximum: 6, description: 'Likeness ties per card (3 usual; 0 for none).' },
				spread: { type: 'number', minimum: 0.5, maximum: 2.5, description: 'Air between cards (1 usual).' }
			},
			required: ['sources']
		},
		async execute(args) {
			const input = args as Record<string, unknown>;
			const asks = mapAsks(input.sources);
			if (!asks.length) throw new Error(`Give \`sources\`: a list such as [{"source":"readwise"}]. The sources are ${MAP_SOURCES.join(', ')}, or "all".`);
			const whole = (value: unknown, low: number, high: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, Math.round(value))) : undefined);
			const days = whole(input.days, 1, 366);
			// Everything ever saved to a source is not a map: with no place and no words, a source needs days.
			const open = asks.filter((ask) => !ask.in && !ask.query && ask.source !== 'site' && !(ask.days ?? days));
			if (open.length) throw new Error(`Give \`days\` (7 for this week), or a place (\`in\`) or words (\`query\`) for ${open.map((ask) => MAP_SOURCE_NAME[ask.source]).join(' and ')}: all of it at once is too much for one map.`);
			const redo = (Array.isArray(input.redo) ? input.redo : []).filter((stage): stage is MapStage => MAP_STAGES.includes(stage as MapStage));
			const similar = whole(input.similar, 0, 6);
			const spread = typeof input.spread === 'number' && Number.isFinite(input.spread) ? Math.max(0.5, Math.min(2.5, input.spread)) : undefined;
			const request = { asks, days, redo, ...(similar !== undefined ? { similar } : {}), ...(spread ? { spread } : {}) };

			const started = Date.now();
			const map = await buildMap(request, {
				saves: deps.saves(), origin: deps.origin(), assets: deps.env.ASSETS,
				state: deps.env.PUBLISHING_STATE, pictures: deps.env.SCREENSHOTS, images: deps.env.IMAGES,
				model: mapModel(deps.env),
				now: deps.now(), timeZone: deps.timeZone,
				...deps.overrides
			});
			const notes = map.docs.notes;
			// A source that couldn't be read is not a source with nothing in it.
			const unread = notes.filter((note) => /couldn’t be read/.test(note));
			if (!map.graph.cards.length && unread.length) throw new Error(`${unread.join(' ')} Nothing was put on a table. Tell Casey; don’t try again this turn.`);
			if (!map.graph.cards.length) return { output: [{ type: 'text' as const, text: JSON.stringify({ added: 0, found: 0, ...(notes.length ? { notes } : {}), next: 'Nothing was saved there in that time. Say so; offer more days or another source.' }) }] };

			const name = said(input.name)?.slice(0, 120) ?? mapName(request);
			let made: { url: string; open: boolean } | undefined;
			if (!deps.table()) {
				made = await deps.makeTable(name);
				if (!made.open || !deps.table()) throw new Error(`The map is built (${map.graph.cards.length} cards) and a new draft table was made at ${made.url}, but it hasn’t opened in Casey’s browser, so nothing is on it yet. Give Casey the link, and call this again once Casey says it is open: nothing will be fetched twice.`);
			}

			const by = new Map<string, number>();
			for (const doc of map.docs.docs) by.set(doc.source, (by.get(doc.source) ?? 0) + 1);
			const strong = map.links.edges.filter((edge) => edge.strong), light = map.links.edges.length - strong.length;
			const counted = [...by].map(([source, count]) => `${count} from ${MAP_SOURCE_NAME[source as MapSource]}`).join(', ');
			const note = [counted, `${strong.length} ${strong.length === 1 ? 'tie' : 'ties'} by link or shared citation (solid)`, light ? `${light} by likeness (dotted)` : ''].filter(Boolean).join(' · ');
			const done = await deps.run({ op: 'add_map', key: map.key, title: name, note, cards: map.graph.cards.map(({ block, x, y, w, h }) => ({ block, x, y, w, h })), links: map.graph.links });

			// What the model needs to say something true about the map: its hubs, and what several things cite.
			const title = new Map(map.docs.docs.map((doc) => [doc.id, doc.title]));
			const degree = new Map<string, number>();
			for (const edge of strong) for (const id of [edge.from, edge.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
			const hubs = [...degree].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({ title: clip(title.get(id) ?? '', 80), ties: count }));
			const cited = map.links.citations.slice(0, 5).map((citation) => ({ url: citation.url, by: citation.by.slice(0, 4).map((id) => clip(title.get(id) ?? '', 60)) }));
			const quotes = Object.values(map.quotes.quotes).filter(Boolean).length;
			return { output: [{ type: 'text' as const, text: JSON.stringify({
				map: name, ...(made ? { url: made.url, table: 'new draft table, open beside the chat' } : {}),
				cards: map.graph.cards.length, sources: Object.fromEntries(by), replaced: !!done.replaced,
				lines: { linked_or_cited: strong.length, alike: light },
				quotes, pictures: map.images.kept, title_tiles: map.images.tiles, ...(map.images.people ? { pictures_of_people_left_out: map.images.people } : {}),
				...(hubs.length ? { hubs } : {}), ...(cited.length ? { cited_by_several: cited } : {}),
				...(notes.length ? { notes: notes.slice(0, 6) } : {}), ...(typeof done.overlaps === 'number' ? { overlaps: done.overlaps } : {}),
				stages_run: map.ran, seconds: Math.round((Date.now() - started) / 100) / 10,
				next: 'It is on the table, laid out: don’t arrange, connect or read it. Tell Casey in two or three sentences what the map shows (the hubs, what is cited by several, any notes).'
			}) }] };
		}
	};
}
