import { describe, expect, test } from 'bun:test';
import { ftsTerms } from '../src/lib/server/sources/index';
import { document, memoryIndex } from './helpers/sources';

describe('source index', () => {
	test('finds documents by words in the title, the text, the note and the highlights', () => {
		const index = memoryIndex();
		index.upsert([
			document({ id: 'a', title: 'Calm technology', text: 'Designing for the periphery of attention.' }),
			document({ id: 'b', title: 'Kettles', text: 'A tea kettle whistles when it is done.', note: 'An example of ambient feedback' }),
			document({ id: 'c', source: 'raindrop', kind: 'link', title: 'Glow', highlights: [{ id: 'h1', text: 'The orb glows with the weather', note: 'peripheral' }] })
		]);
		expect(index.search({ owner: true, query: 'periphery' }).hits.map((hit) => hit.id)).toEqual(['a']);
		expect(index.search({ owner: true, query: 'ambient feedback' }).hits.map((hit) => hit.id)).toEqual(['b']);
		expect(index.search({ owner: true, query: 'orb weather' }).hits.map((hit) => hit.id)).toEqual(['c']);
		// Stemming: "designs" finds "Designing".
		expect(index.search({ owner: true, query: 'designs' }).total).toBe(1);
	});

	test('a title match ranks above a passing mention, and the excerpt is the words around the match', () => {
		const index = memoryIndex();
		index.upsert([
			document({ id: 'mention', title: 'Notes on gardens', text: `${'Soil and compost. '.repeat(40)} Somewhere a kettle sang. ${'More soil. '.repeat(40)}` }),
			document({ id: 'title', title: 'The kettle', text: 'Boiling water, mostly.' })
		]);
		const result = index.search({ owner: true, query: 'kettle' });
		expect(result.hits.map((hit) => hit.id)).toEqual(['title', 'mention']);
		expect(result.hits[1].excerpt).toContain('kettle sang');
		expect(result.hits[1].excerpt!.length).toBeLessThan(500);
	});

	test('when nothing has every word, any of them will do, and says so', () => {
		const index = memoryIndex();
		index.upsert([document({ id: 'a', title: 'Calm technology' }), document({ id: 'b', title: 'Loud technology' })]);
		expect(index.search({ owner: true, query: 'calm technology' }).matched).toBe('all');
		const loose = index.search({ owner: true, query: 'calm kettles' });
		expect(loose.matched).toBe('any');
		expect(loose.hits.map((hit) => hit.id)).toEqual(['a']);
	});

	test('what a person types is never read as search syntax', () => {
		expect(ftsTerms('calm AND "tech" NOT (x) title:foo*')).toEqual(['"calm"', '"and"', '"tech"', '"not"', '"title"', '"foo"']);
		const index = memoryIndex();
		index.upsert([document({ id: 'a', title: 'Calm' })]);
		expect(() => index.search({ owner: true, query: '") OR 1=1 --' })).not.toThrow();
		expect(index.search({ owner: true, query: '"' }).total).toBe(1);
	});

	test('without words it lists by date, within the filters', () => {
		const index = memoryIndex();
		index.upsert([
			document({ id: 'old', created: '2026-10-01T00:00:00.000Z', places: ['Archive'] }),
			document({ id: 'new', created: '2026-11-26T09:00:00.000Z', places: ['Inbox'], tags: ['design'] }),
			document({ id: 'drop', source: 'raindrop', kind: 'link', created: '2026-11-25T09:00:00.000Z' })
		]);
		expect(index.search({ owner: true, since: '2026-11-20' }).hits.map((hit) => hit.id)).toEqual(['new', 'drop']);
		expect(index.search({ owner: true, since: '2026-11-20', until: '2026-11-25' }).hits.map((hit) => hit.id)).toEqual(['drop']);
		expect(index.search({ owner: true, source: 'readwise', place: 'inbox' }).hits.map((hit) => hit.id)).toEqual(['new']);
		expect(index.search({ owner: true, tag: 'Design' }).total).toBe(1);
		expect(index.search({ owner: true, kind: 'link' }).total).toBe(1);
	});

	test('highlights that arrive before or after their document end up on it', () => {
		const index = memoryIndex();
		index.upsertHighlights([{ id: 'h1', parent: 'a', text: 'Arrived first', created: '2026-11-01T00:00:00Z' }], 'readwise');
		index.upsert([document({ id: 'a', title: 'Article' })]);
		index.upsertHighlights([{ id: 'h2', parent: 'a', text: 'Arrived after', note: 'my note', created: '2026-11-02T00:00:00Z' }], 'readwise');
		const stored = index.get('readwise:a', { owner: true })!;
		expect(stored.allHighlights.map((highlight) => highlight.text)).toEqual(['Arrived first', 'Arrived after']);
		expect(stored.highlights).toBe(2);
		expect(index.search({ owner: true, query: 'arrived first' }).total).toBe(1);
		expect(index.search({ owner: true, highlighted: true }).total).toBe(1);
		index.removeHighlights('readwise', ['h1']);
		expect(index.get('readwise:a', { owner: true })!.allHighlights.map((highlight) => highlight.id)).toEqual(['h2']);
		expect(index.search({ owner: true, query: 'first' }).total).toBe(0);
	});

	test('one document is read by key, id or either address, its text a part at a time', () => {
		const index = memoryIndex();
		index.upsert([document({ id: 'a', url: 'https://example.com/post/', openUrl: 'https://read.readwise.io/read/a', text: 'x'.repeat(100) + 'y'.repeat(100), extra: { progress: 0.5 }, note: 'Mine' })]);
		for (const wanted of ['readwise:a', 'a', 'https://example.com/post', 'https://example.com/post/#top', 'https://read.readwise.io/read/a']) expect(index.get(wanted, { owner: true })?.id).toBe('a');
		const part = index.get('readwise:a', { owner: true, from: 90, limit: 20 })!;
		expect(part.text).toBe('x'.repeat(10) + 'y'.repeat(10));
		expect(part.length).toBe(200);
		expect(part.extra).toEqual({ progress: 0.5, note: 'Mine' });
		expect(index.get('nothing', { owner: true })).toBeNull();
	});

	test('an update replaces a document; one with no text of its own keeps a page that was read for it', () => {
		const index = memoryIndex();
		index.upsert([document({ id: 'a', source: 'raindrop', kind: 'link', title: 'Old title', summary: 'short' })]);
		expect(index.thin(10).map((entry) => entry.key)).toEqual(['raindrop:a']);
		index.fill('raindrop:a', { text: 'The whole page about kettles.', links: ['https://example.com/x'], image: 'https://example.com/i.jpg' });
		expect(index.thin(10)).toEqual([]);
		index.upsert([document({ id: 'a', source: 'raindrop', kind: 'link', title: 'New title', summary: 'short' })]);
		const stored = index.get('raindrop:a', { owner: true })!;
		expect(stored.title).toBe('New title');
		expect(stored.text).toBe('The whole page about kettles.');
		expect(stored.textFrom).toBe('page');
		expect(stored.image).toBe('https://example.com/i.jpg');
		expect(index.search({ owner: true, query: 'kettles' }).total).toBe(1);
		// A page that couldn't be read is tried once, not forever.
		index.upsert([document({ id: 'b', source: 'raindrop', kind: 'link' })]);
		index.fill('raindrop:b', null);
		expect(index.thin(10)).toEqual([]);
	});

	test('removing takes the document, its highlights and its vectors', () => {
		const index = memoryIndex();
		index.upsert([document({ id: 'a' }), document({ id: 'b' })], '2026-11-01T00:00:00.000Z');
		index.upsertHighlights([{ id: 'h', parent: 'a', text: 'gone too' }], 'readwise');
		index.saveVector('readwise:a', 'text', [1, 0]);
		expect(index.remove('readwise', ['a', 'missing'])).toEqual(['readwise:a']);
		expect(index.search({ owner: true, query: 'gone' }).total).toBe(0);
		expect(index.nearest([1, 0])).toEqual([]);
		// After a pass that listed everything, what it didn't list is gone.
		index.upsert([document({ id: 'c' })], '2026-11-02T00:00:00.000Z');
		expect(index.removeUnseen('readwise', '2026-11-01T12:00:00.000Z')).toEqual(['readwise:b']);
		expect(index.stats()).toEqual([expect.objectContaining({ source: 'readwise', documents: 1 })]);
	});

	test('places are set from a listing of the place, and survive the document being synced again', () => {
		const index = memoryIndex();
		index.upsert([document({ id: '1', source: 'arena', kind: 'image' }), document({ id: '2', source: 'arena', kind: 'link' })]);
		index.setPlace('arena', 'Calm Technology', ['1', '2', 'not-here']);
		index.setPlace('arena', 'Kettles', ['2']);
		index.upsert([{ ...document({ id: '2', source: 'arena', kind: 'link', title: 'Renamed' }), keepPlaces: true }]);
		expect(index.get('arena:2', { owner: true })!.places).toEqual(['Calm Technology', 'Kettles']);
		index.setPlace('arena', 'Calm Technology', ['1']);
		expect(index.get('arena:2', { owner: true })!.places).toEqual(['Kettles']);
		expect(index.places({ owner: true })).toEqual([{ source: 'arena', place: 'Calm Technology', count: 1 }, { source: 'arena', place: 'Kettles', count: 1 }]);
		expect(index.search({ owner: true, query: 'kettles' }).hits.map((hit) => hit.id)).toEqual(['2']);
	});

	test('nearest gives each document once, by its closer vector', () => {
		const index = memoryIndex();
		index.upsert([document({ id: 'a' }), document({ id: 'b' }), document({ id: 'c' })]);
		index.saveVector('readwise:a', 'text', [1, 0, 0]);
		index.saveVector('readwise:a', 'image', [0.9, 0.1, 0]);
		index.saveVector('readwise:b', 'text', [0, 5, 0]);
		index.saveVector('readwise:c', 'image', [0.7, 0.7, 0]);
		expect(index.nearest([2, 0, 0]).map((entry) => entry.key)).toEqual(['readwise:a', 'readwise:c', 'readwise:b']);
		expect(index.nearest([1, 0, 0], { what: 'image', not: 'readwise:a' }).map((entry) => entry.key)).toEqual(['readwise:c']);
		expect(index.nearest([1, 0, 0])[0].score).toBeCloseTo(1, 5);
	});
});
