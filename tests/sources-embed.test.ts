import { describe, expect, test } from 'bun:test';
import { EMBED_DIMENSIONS, EMBED_MODEL, embedPending, similar } from '../src/lib/server/sources/embed';
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
});
