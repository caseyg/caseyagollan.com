import { describe, expect, test } from 'bun:test';
import { EMBED_DIMENSIONS, EMBED_MODEL, READ_MODEL, READ_USAGE, alike, embedPending, imageWords, readPending, readWords, similar } from '../src/lib/server/sources/embed';
import { document, memoryIndex } from './helpers/sources';

/** A stand-in for the embedding model: one direction for tea, one for boats, so likeness can be told. */
function fakeAI(calls: { model: string; texts: number; dimensions: number }[] = []) {
	const vector = (words: string) => { const v = new Array(EMBED_DIMENSIONS).fill(0); v[0] = /tea|kettle/i.test(words) ? 1 : 0.05; v[1] = /boat|sail/i.test(words) ? 1 : 0.05; return v; };
	return { run: async (model: string, input: { input?: string[]; dimensions: number }) => { calls.push({ model, texts: input.input?.length ?? 0, dimensions: input.dimensions }); return { data: (input.input ?? []).map((words, index) => ({ index, embedding: vector(words) })) }; } };
}

describe('likeness between saved things', () => {
	test('documents are embedded once, and found by meaning; privacy still holds', async () => {
		const index = memoryIndex(), calls: { model: string; texts: number; dimensions: number }[] = [];
		index.upsert([
			document({ id: 'tea', title: 'On kettles', text: 'How a kettle makes tea.' }),
			document({ id: 'tea2', source: 'arena', title: 'Tea notes', text: 'tea, mostly', private: false }),
			document({ id: 'boat', title: 'Sailing', text: 'A boat with a sail.' })
		], '2026-11-27T12:00:00.000Z');
		const env = { AI: fakeAI(calls) };
		expect(await embedPending(index, env)).toEqual({ text: 3, images: 0, left: false });
		expect(calls).toEqual([{ model: EMBED_MODEL, texts: 3, dimensions: EMBED_DIMENSIONS }]);
		expect(await embedPending(index, env)).toEqual({ text: 0, images: 0, left: false });
		const like = await similar(index, env, { owner: true, like: 'readwise:tea' });
		expect(like.map((hit) => hit.key)).toEqual(['arena:tea2', 'readwise:boat']);
		expect(like[0].score).toBeGreaterThan(like[1].score);
		expect((await similar(index, env, { owner: true, query: 'boats', limit: 1 })).map((hit) => hit.key)).toEqual(['readwise:boat']);
		// A visitor never gets a private document back, however near it is.
		expect((await similar(index, env, { owner: false, query: 'tea' })).map((hit) => hit.key)).toEqual(['arena:tea2']);
		expect(await similar(index, env, { owner: false, like: 'readwise:tea' })).toEqual([]);
		// A changed document is embedded again.
		index.upsert([document({ id: 'boat', title: 'Sailing', text: 'A boat, rewritten.' })], '2026-11-27T13:00:00.000Z');
		expect((await embedPending(index, env)).text).toBe(1);
	});

	test('without the model nothing is embedded and nothing breaks', async () => {
		const index = memoryIndex();
		index.upsert([document({ id: 'tea', text: 'tea' })], '2026-11-27T12:00:00.000Z');
		expect(await embedPending(index, {})).toEqual({ text: 0, images: 0, left: false });
		expect(await similar(index, {}, { owner: true, query: 'tea' })).toEqual([]);
	});

	/** The embedding model and the one that reads pictures: a picture's direction is told by its address, its words by `seen`. */
	function sightedAI(seen: Record<string, string>, reads: string[] = []) {
		const vector = (words: string) => { const v = new Array(EMBED_DIMENSIONS).fill(0); v[0] = /tea|kettle/i.test(words) ? 1 : 0.05; v[1] = /boat|sail/i.test(words) ? 1 : 0.05; v[2] = /garden|moss/i.test(words) ? 1 : 0.05; return v; };
		return {
			run: async (model: string, input: { input?: string[]; messages?: { content: { image_url: { url: string } }[] }[][]; image?: string }) => {
				if (model === READ_MODEL) { reads.push(input.image!); return { answer: seen[input.image!] ?? 'NONE' }; }
				return { data: (input.input ?? input.messages!.map((message) => message[0].content[0].image_url.url)).map((words, index) => ({ index, embedding: vector(words) })) };
			}
		};
	}
	// Pictures are "fetched" as their own address, so the stand-in model can tell them apart.
	const see = async (url: string) => url;

	test('what the model says is kept as the words alone', () => {
		expect(readWords('NONE')).toBe('');
		expect(readWords('No readable text.')).toBe('');
		expect(readWords('```\nTEA TIME\n4 pm\n```')).toBe('TEA TIME\n4 pm');
		expect(readWords('"Gardens of moss"')).toBe('Gardens of moss');
		expect(readWords('No text is safe from editors, said the sign')).toBe('No text is safe from editors, said the sign');
	});

	test('the words in a picture are read once, kept, searched, and survive a sync', async () => {
		const index = memoryIndex(), reads: string[] = [];
		const poster = 'https://images.example/poster.png';
		index.upsert([document({ id: 'poster', source: 'arena', kind: 'image', title: 'Untitled', image: poster }), document({ id: 'boat', title: 'Sailing', text: 'A boat with a sail.' })], '2026-11-27T12:00:00.000Z');
		expect(index.search({ owner: true, query: 'moss' }).total).toBe(0);
		const env = { AI: sightedAI({ [poster]: 'Gardens of moss, a lecture' }, reads), see };
		expect(await imageWords(index, env, poster)).toBe('Gardens of moss, a lecture');
		expect(await imageWords(index, env, poster)).toBe('Gardens of moss, a lecture');
		expect(reads).toHaveLength(1);
		expect(index.imageText(poster)).toBe('Gardens of moss, a lecture');
		expect(index.search({ owner: true, query: 'moss' }).hits.map((hit) => hit.key)).toEqual(['arena:poster']);
		// The same document synced again keeps the words it was found by.
		index.upsert([document({ id: 'poster', source: 'arena', kind: 'image', title: 'Untitled poster', image: poster })], '2026-11-28T12:00:00.000Z');
		expect(index.search({ owner: true, query: 'moss' }).hits.map((hit) => hit.key)).toEqual(['arena:poster']);
		// And its likeness is worked out with them.
		expect(index.unembedded('text', 10).find((entry) => entry.key === 'arena:poster')?.seen).toBe('Gardens of moss, a lecture');
		// A picture with no words is remembered as such, and not read again.
		const plain = 'https://images.example/plain.png';
		await imageWords(index, env, plain);
		await imageWords(index, env, plain);
		expect(index.imageText(plain)).toBe('');
		expect(reads).toHaveLength(2);
		// Without the model, only what was kept is answered.
		expect(await imageWords(index, {}, 'https://images.example/new.png')).toBeUndefined();
	});

	test('several things at once: what is near more of them comes first, and they themselves are left out', async () => {
		const index = memoryIndex();
		index.upsert([
			document({ id: 'tea', title: 'On kettles', text: 'How a kettle makes tea.' }),
			document({ id: 'teaboat', title: 'Tea on a boat', text: 'Tea, with a sail up.' }),
			document({ id: 'boat', title: 'Sailing', text: 'A boat with a sail.' }),
			document({ id: 'moss', source: 'arena', title: 'Moss', text: 'A garden of moss.', private: false })
		], '2026-11-27T12:00:00.000Z');
		const env = { AI: sightedAI({}) };
		await embedPending(index, env);
		// A sticky's words alone.
		expect((await alike(index, env, { owner: true, seeds: [{ words: 'gardens' }], limit: 1 })).map((hit) => hit.key)).toEqual(['arena:moss']);
		// A saved document and a sticky: what is like both leads, and the document itself is not offered.
		const both = await alike(index, env, { owner: true, seeds: [{ url: 'https://example.com/tea', words: 'On kettles' }, { words: 'a boat under sail' }], limit: 3 });
		expect(both[0].key).toBe('readwise:teaboat');
		expect(both.map((hit) => hit.key)).not.toContain('readwise:tea');
		// A block the copy doesn't hold is asked about by its words.
		expect((await alike(index, env, { owner: true, seeds: [{ url: 'https://elsewhere.example/x', words: 'moss in the garden' }], limit: 1 })).map((hit) => hit.key)).toEqual(['arena:moss']);
		// A visitor still only ever gets what is public.
		expect((await alike(index, env, { owner: false, seeds: [{ words: 'tea' }, { words: 'moss' }] })).map((hit) => hit.key)).toEqual(['arena:moss']);
		expect(await alike(index, env, { owner: true, seeds: [] })).toEqual([]);
	});

	test('a picture finds what reads like the words in it, as well as what looks like it', async () => {
		const index = memoryIndex(), reads: string[] = [];
		index.upsert([document({ id: 'moss', title: 'Moss', text: 'A garden of moss.' }), document({ id: 'boat', title: 'Sailing', text: 'A boat with a sail.' })], '2026-11-27T12:00:00.000Z');
		const flyer = 'https://images.example/flyer.png';
		const env = { AI: sightedAI({ [flyer]: 'Moss garden open day, Saturday' }, reads), see };
		await embedPending(index, env);
		expect((await alike(index, env, { owner: true, seeds: [{ picture: flyer }], limit: 1 })).map((hit) => hit.key)).toEqual(['readwise:moss']);
		await alike(index, env, { owner: true, seeds: [{ picture: flyer }], limit: 1 });
		expect(reads).toHaveLength(1);
		expect(index.imageText(flyer)).toBe('Moss garden open day, Saturday');
	});

	test('stored pictures are read a batch at a time, only when asked, each tried once', async () => {
		const index = memoryIndex(), reads: string[] = [];
		const address = (at: number) => `https://images.example/${at}.png`;
		index.upsert(Array.from({ length: 13 }, (_, at) => document({ id: `p${at}`, source: 'arena', kind: 'image', title: `Picture ${at}`, image: address(at), created: `2026-11-${String(10 + at).padStart(2, '0')}T12:00:00.000Z` })), '2026-11-27T12:00:00.000Z');
		const seen = { [address(12)]: 'Moss garden open day', [address(11)]: 'NONE' };
		const model = sightedAI(seen, reads);
		// The newest picture can't be fetched; the model counts its tokens for the rest.
		const env = { see, AI: { run: async (name: string, input: { image?: string }) => { if (input.image === address(10)) throw new Error('gone'); const answer = await model.run(name, input as never); return name === READ_MODEL ? { ...answer, usage: { input_tokens: 1200, output_tokens: 100 } } : answer; } } };
		expect(index.pictureCounts()).toEqual({ total: 13, read: 0, withWords: 0, failed: 0 });
		expect(await readPending(index, env, 3)).toEqual({ read: 2, failed: 1, left: true });
		expect(index.pictureCounts()).toEqual({ total: 13, read: 2, withWords: 1, failed: 1 });
		expect(index.state<unknown>(READ_USAGE)).toEqual({ pictures: 2, input: 2400, output: 200 });
		expect(index.search({ owner: true, query: 'moss' }).hits.map((hit) => hit.key)).toEqual(['arena:p12']);
		expect(index.recentImageText(5).map((entry) => entry.failed).sort()).toEqual([false, false, true]);
		// The rest, ten at a time, and never the failed one again.
		expect(await readPending(index, env, 100)).toEqual({ read: 10, failed: 0, left: false });
		expect(await readPending(index, env, 100)).toEqual({ read: 0, failed: 0, left: false });
		expect(reads.filter((url) => url === address(10))).toHaveLength(0);
		expect(index.pictureCounts()).toEqual({ total: 13, read: 12, withWords: 1, failed: 1 });
		// Asked about on a table, the one that failed is tried again; and a failed model's marks can be cleared.
		expect(index.imageText(address(10))).toBeUndefined();
		index.forgetFailedPictures();
		expect(index.unreadPictures(5)).toEqual([address(10)]);
		expect(await readPending(index, {}, 5)).toEqual({ read: 0, failed: 0, left: false });
	});
});
