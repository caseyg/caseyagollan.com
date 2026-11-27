import { describe, expect, test } from 'bun:test';
import { buildEdges } from '../src/lib/server/maps/edges';
import { buildMap, mapKey, mapName } from '../src/lib/server/maps/pipeline';
import { candidates, pickQuotes, quotable, verbatim } from '../src/lib/server/maps/quotes';
import { languageOf, likeness, linksIn, normalUrl } from '../src/lib/server/maps/text';
import type { MapDoc } from '../src/lib/server/maps/types';
import { mapAsks } from '../src/lib/server/chat/map-tool';
import { cardSize } from '../src/lib/table-card';
import { cleanBlock } from '../src/lib/tables';

const doc = (id: string, given: Partial<MapDoc> = {}): MapDoc => ({ id: `readwise:${id}`, source: 'readwise', url: `https://${id}.example/post`, title: `About ${id}`, site: `${id}.example`, text: '', links: [], images: [], highlights: [], ...given });

const GARDEN = 'Community gardens turn vacant lots into shared kitchens for a whole block. Gardeners trade seedlings, compost and recipes across the fence every spring. The soil remembers every season of tomatoes and beans.';
const GARDEN_TWO = 'A vacant lot became a community garden when neighbours hauled in compost and seedlings. Now the gardeners share tomatoes, beans and the work of the soil each season.';
const TRAINS = 'Night trains are returning to Europe as travellers look for slower routes. Sleeper carriages now run from Brussels to Prague three times a week. Operators say the rolling stock is the bottleneck.';
const DANSK = 'Det er en lang historie om byen og dens haver, som vi har skrevet om før. Der er ikke mange, der ved, at jorden blev givet til borgerne af kommunen for hundrede år siden, og at den stadig er deres.';

describe('map text', () => {
	test('two addresses of one page compare equal', () => {
		expect(normalUrl('https://www.example.com/a/?utm_source=x&b=2#top')).toBe(normalUrl('http://example.com/a?b=2'));
		expect(normalUrl('https://youtu.be/abc123?t=40')).toBe(normalUrl('https://www.youtube.com/watch?v=abc123&feature=share'));
		expect(normalUrl('mailto:someone@example.com')).toBeNull();
	});
	test('links are read from Markdown and HTML, pictures left out', () => {
		expect(linksIn('See [this](https://a.example/one), ![pic](https://a.example/p.png) and <a href="https://b.example/two">that</a>.')).toEqual(['https://a.example/one', 'https://b.example/two']);
	});
	test('a text’s language is told by its small words, and likeness stays within one language', () => {
		expect(languageOf(DANSK)).toBe('da');
		expect(languageOf(GARDEN)).toBe('en');
		const pairs = likeness([{ id: 'a', title: 'Gardens', text: GARDEN }, { id: 'b', title: 'A garden', text: GARDEN_TWO }, { id: 'c', title: 'Trains', text: TRAINS }, { id: 'd', title: 'Haver', text: DANSK }, { id: 'e', title: 'Haver igen', text: DANSK }], 0.01);
		expect(pairs.some((pair) => (pair.a === 'd' || pair.b === 'd') && pair.a !== 'e' && pair.b !== 'e')).toBe(false);
		const garden = pairs.find((pair) => pair.a === 'a' && pair.b === 'b')!;
		expect(garden.score).toBeGreaterThan(pairs.find((pair) => pair.a === 'a' && pair.b === 'c')?.score ?? 0);
		expect(garden.shared.length).toBeGreaterThan(0);
	});
});

describe('map edges', () => {
	const docs = [
		doc('one', { text: GARDEN, links: ['https://two.example/post?utm_source=feed', 'https://report.example/2026/soil', 'https://one.example/about', 'https://x.com/somebody'] }),
		doc('two', { text: GARDEN_TWO, links: ['https://report.example/2026/soil/', 'https://facebook.com/sharer/sharer.php?u=x'] }),
		doc('three', { text: TRAINS, links: ['https://report.example/2026/soil#findings', 'https://x.com/somebody'] }),
		doc('four', { title: 'About one', url: 'https://youtube.com/watch?v=zzz', site: 'YouTube', text: 'Something else entirely about ferries and harbours and tides.' })
	];
	const built = buildEdges(docs);
	const between = (a: string, b: string) => built.edges.find((edge) => [edge.from, edge.to].sort().join() === [`readwise:${a}`, `readwise:${b}`].sort().join());

	test('a link from one saved page to another is the backbone', () => {
		expect(between('one', 'two')).toMatchObject({ kind: 'link', strong: true });
	});
	test('pages that cite the same source are tied, and the citation is named', () => {
		expect(between('one', 'three')).toMatchObject({ kind: 'cites', strong: true, label: 'both cite report.example' });
		expect(built.citations[0]).toEqual({ url: 'report.example/2026/soil', by: ['readwise:one', 'readwise:two', 'readwise:three'] });
	});
	test('profiles, share buttons and a site’s own pages cite nothing', () => {
		expect(built.citations.map((citation) => citation.url)).toEqual(['report.example/2026/soil']);
	});
	test('likeness is a lighter tier, and with `similar` 0 only facts remain', () => {
		const roofs = 'Rooftop gardens cool the buildings beneath them and feed pollinators through the summer heat. Gardeners trade compost and seedlings with the schools nearby, and engineers measure the load on every beam.';
		const weak = buildEdges([doc('a', { text: GARDEN }), doc('b', { text: roofs }), doc('c', { text: TRAINS })]).edges;
		// Near-identical words are one story saved twice, which is a fact, not a likeness.
		expect(buildEdges([doc('a', { text: GARDEN }), doc('b', { text: GARDEN_TWO }), doc('c', { text: TRAINS })]).edges[0]).toMatchObject({ kind: 'same', strong: true });
		expect(weak.find((edge) => edge.kind === 'similar')).toMatchObject({ strong: false });
		expect(weak.every((edge) => edge.strong || edge.weight < 1)).toBe(true);
		expect(buildEdges(docs, { similar: 0 }).edges.every((edge) => edge.strong)).toBe(true);
	});
});

describe('map quotes', () => {
	test('credits, sign-ups and fragments are never quotes', () => {
		expect(quotable('Subscribe to our newsletter to get the latest stories in your inbox.')).toBe(false);
		expect(quotable('Photo by a staff photographer for the magazine, all rights reserved.')).toBe(false);
		expect(quotable('and then the rest of it trailed off without')).toBe(false);
		expect(quotable('The soil remembers every season of tomatoes and beans.')).toBe(true);
	});
	test('a highlight wins over anything a model would choose', async () => {
		const marked = doc('m', { text: GARDEN, highlights: ['The soil remembers every season'] });
		const { quotes } = await pickQuotes([marked], async () => '1: 1');
		expect(quotes[marked.id]).toEqual({ text: 'The soil remembers every season', from: 'highlight' });
	});
	test('the model picks among candidates, and only words the source has are kept', async () => {
		const plain = doc('p', { text: GARDEN });
		const options = candidates(plain);
		expect(options.length).toBeGreaterThan(1);
		expect((await pickQuotes([plain], async () => '1: 2')).quotes[plain.id]).toEqual({ text: options[1], from: 'model' });
		expect((await pickQuotes([plain], async () => '1: 0')).quotes[plain.id]).toBeNull();
		// No model, or one that fails: the first candidate by the rules.
		expect((await pickQuotes([plain], async () => { throw new Error('down'); })).quotes[plain.id]).toEqual({ text: options[0], from: 'rule' });
		expect(verbatim('Gardens are the future of cities everywhere.', plain)).toBe(false);
		expect(verbatim('Gardeners trade seedlings, compost and recipes', plain)).toBe(true);
	});
});

function bucket() {
	const kept = new Map<string, string>();
	return {
		kept,
		async get(key: string) { const value = kept.get(key); return value === undefined ? null : { json: async () => JSON.parse(value), text: async () => value }; },
		async put(key: string, value: string) { kept.set(key, value); }
	};
}

describe('the map pipeline', () => {
	const documents = [
		{ id: 'a1', title: 'Gardens of the block', source_url: 'https://one.example/gardens', site_name: 'One', category: 'article', location: 'new', saved_at: '2026-11-24T10:00:00Z', html_content: `<p>${GARDEN}</p><p>As <a href="https://two.example/lots">an earlier piece</a> said.</p>` },
		{ id: 'a2', title: 'Vacant lots', source_url: 'https://two.example/lots', site_name: 'Two', category: 'article', location: 'later', saved_at: '2026-11-23T10:00:00Z', html_content: `<p>${GARDEN_TWO}</p>` },
		{ id: 'a3', title: 'Night trains', source_url: 'https://three.example/trains', site_name: 'Three', category: 'article', location: 'later', saved_at: '2026-11-22T10:00:00Z', html_content: `<p>${TRAINS}</p>` },
		{ id: 'h1', parent_id: 'a3', category: 'highlight', content: 'Operators say the rolling stock is the bottleneck.', saved_at: '2026-11-22T11:00:00Z' },
		{ id: 'f1', title: 'From a feed', source_url: 'https://feed.example/item', category: 'rss', location: 'feed', saved_at: '2026-11-24T10:00:00Z', html_content: '<p>Not saved by hand.</p>' }
	];
	const setup = () => {
		const asked: string[] = [];
		const fetcher = (async (input: RequestInfo | URL) => { asked.push(String(input instanceof Request ? input.url : input)); return Response.json({ results: documents, nextPageCursor: null }); }) as typeof fetch;
		const state = bucket();
		const deps = { saves: { env: { READWISE_ACCESS_TOKEN: 'test' }, fetcher }, origin: 'https://caseyagollan.com/', state: state as unknown as R2Bucket, now: new Date('2026-11-25T20:00:00Z'), timeZone: 'America/New_York', pageFetch: (async () => new Response('', { status: 404 })) as never };
		return { asked, state, deps };
	};

	test('builds cards, two tiers of ties and a layout from one source, with a file kept per stage', async () => {
		const { asked, state, deps } = setup();
		const map = await buildMap({ asks: [{ source: 'readwise' }], days: 7 }, deps);
		expect(map.ran).toEqual(['docs', 'links', 'quotes', 'images', 'graph']);
		expect(map.docs.docs.map((one) => one.title)).toEqual(['Gardens of the block', 'Vacant lots', 'Night trains']);
		expect(new URL(asked[0]).searchParams.get('updatedAfter')).toStartWith('2026-11-1');
		expect(map.links.edges.find((edge) => edge.kind === 'link')).toMatchObject({ from: 'readwise:a1', to: 'readwise:a2', strong: true });
		expect(map.quotes.quotes['readwise:a3']).toEqual({ text: 'Operators say the rolling stock is the bottleneck.', from: 'highlight' });
		expect(map.graph.cards).toHaveLength(3);
		const card = map.graph.cards.find((one) => one.id === 'readwise:a3')!;
		expect(card.block).toMatchObject({ kind: 'link', form: 'card', url: 'https://three.example/trains', title: 'Night trains', quote: 'Operators say the rolling stock is the bottleneck.', marked: true });
		// No storage for pictures here: every card falls back to its title tile.
		expect(map.images).toMatchObject({ kept: 0, tiles: 3 });
		expect(card.block.image).toBeUndefined();
		expect({ w: card.w, h: card.h }).toEqual(cardSize(card.block));
		expect([...state.kept.keys()].map((key) => key.replace(/^.*\//, '')).sort()).toEqual(['docs.json', 'graph.json', 'images.json', 'links.json', 'quotes.json']);
		expect([...state.kept.keys()][0]).toStartWith(`private/chat/maps/${map.key}/`);
	});

	test('a second run asks Reader only for what changed, and keeps every stage whose input is the same', async () => {
		const { asked, deps } = setup();
		const first = await buildMap({ asks: [{ source: 'readwise' }], days: 7 }, deps);
		const again = await buildMap({ asks: [{ source: 'readwise' }], days: 7 }, { ...deps, now: new Date('2026-11-25T21:00:00Z') });
		expect(again.ran).toEqual(['docs']);
		expect(new URL(asked[1]).searchParams.get('updatedAfter')).toBe('2026-11-25T19:50:00.000Z');
		expect(again.graph.cards).toEqual(first.graph.cards);
	});

	test('`redo` does one stage again from what is kept, without reading the source', async () => {
		const { asked, deps } = setup();
		const first = await buildMap({ asks: [{ source: 'readwise' }], days: 7 }, deps);
		const wider = await buildMap({ asks: [{ source: 'readwise' }], days: 7, redo: ['graph'], spread: 2 }, deps);
		expect(wider.ran).toEqual(['graph']);
		expect(asked).toHaveLength(1);
		expect(wider.graph.cards.map((card) => card.id)).toEqual(first.graph.cards.map((card) => card.id));
	});

	test('a source that can’t be reached is said so, and the next run reads everything again rather than only what changed', async () => {
		const { asked, deps } = setup();
		let down = true;
		const inner = deps.saves.fetcher;
		const fetcher = (async (input: RequestInfo | URL) => (down ? new Response('no', { status: 503 }) : inner(input))) as typeof fetch;
		const first = await buildMap({ asks: [{ source: 'readwise' }], days: 7 }, { ...deps, saves: { ...deps.saves, fetcher } });
		expect(first.docs).toMatchObject({ docs: [], partial: true });
		expect(first.docs.notes[0]).toStartWith('Readwise couldn’t be read');
		down = false;
		const second = await buildMap({ asks: [{ source: 'readwise' }], days: 7 }, { ...deps, saves: { ...deps.saves, fetcher }, now: new Date('2026-11-25T21:00:00Z') });
		expect(second.docs.docs).toHaveLength(3);
		expect(new URL(asked[0]).searchParams.get('updatedAfter')).toStartWith('2026-11-1');
	});

	test('a place can have its own window: this week’s saves, plus the whole of one shelf', async () => {
		const { asked, deps } = setup();
		const map = await buildMap({ asks: [{ source: 'readwise' }, { source: 'readwise', in: 'later', days: 0 }], days: 7 }, deps);
		expect(new URL(asked[0]).searchParams.get('updatedAfter')).toBeTruthy();
		expect(new URL(asked[1]).searchParams.get('updatedAfter')).toBeNull();
		expect(new URL(asked[1]).searchParams.get('location')).toBe('later');
		expect(map.key).not.toBe(await mapKey({ asks: [{ source: 'readwise' }, { source: 'readwise', in: 'later' }], days: 7 }));
	});

	test('a map is named and keyed by its sources and days, whatever their order', async () => {
		expect(mapName({ asks: [{ source: 'readwise' }], days: 7 })).toBe('This week in Readwise');
		expect(mapName({ asks: [{ source: 'readwise' }, { source: 'arena', in: 'Field notes' }], days: 30 })).toBe('30 days of Readwise and Field notes');
		expect(await mapKey({ asks: [{ source: 'readwise' }, { source: 'arena' }], days: 7 })).toBe(await mapKey({ asks: [{ source: 'arena' }, { source: 'readwise' }], days: 7 }));
		expect(await mapKey({ asks: [{ source: 'readwise' }], days: 7 })).not.toBe(await mapKey({ asks: [{ source: 'readwise' }], days: 8 }));
	});
});

describe('map sources as the model writes them', () => {
	test('objects, bare names and “all” are all understood, once each', () => {
		expect(mapAsks([{ source: 'readwise' }, 'Are.na', { source: 'raindrop', in: ' Design ', query: '', days: 0 }, { source: 'readwise' }, { source: 'nowhere' }])).toEqual([{ source: 'readwise' }, { source: 'arena' }, { source: 'raindrop', in: 'Design', days: 0 }]);
		expect(mapAsks('all').map((ask) => ask.source)).toEqual(['readwise', 'arena', 'raindrop', 'site']);
		expect(mapAsks(undefined)).toEqual([]);
	});
});

describe('source cards', () => {
	test('a block keeps its card form, quote and highlight mark when cleaned', () => {
		expect(cleanBlock({ kind: 'link', url: 'https://one.example/', title: 'One', form: 'card', quote: 'A sentence.', marked: true, extra: 'x' })).toMatchObject({ form: 'card', quote: 'A sentence.', marked: true });
		expect(cleanBlock({ kind: 'link', url: 'https://one.example/', title: 'One', form: 'poster' })?.form).toBeUndefined();
	});
	test('a card is as tall as its words need', () => {
		const short = cardSize({ title: 'One', meta: 'one.example' }), long = cardSize({ title: 'One', meta: 'one.example', quote: GARDEN });
		expect(long.w).toBe(short.w);
		expect(long.h).toBeGreaterThan(short.h);
	});
});
