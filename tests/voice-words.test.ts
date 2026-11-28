import { describe, expect, test } from 'bun:test';
import { changeWords, readWords } from '../src/lib/server/voice-words';
import { GET, POST } from '../src/routes/api/tables/voice/words/+server';

function bucket() {
	const kept = new Map<string, string>();
	return { kept, get: async (key: string) => (kept.has(key) ? { json: async () => JSON.parse(kept.get(key)!) } : null), put: async (key: string, value: string) => { kept.set(key, value); } } as never as Pick<R2Bucket, 'get' | 'put'> & { kept: Map<string, string> };
}

describe('known words, kept by the site', () => {
	test('words are added newest first and taken out whatever their capitals', async () => {
		const store = bucket();
		expect(await readWords(store)).toEqual([]);
		expect(await changeWords(store, ['Otso', 'Propel'], [])).toEqual(['Otso', 'Propel']);
		expect(await changeWords(store, ['caseyagollan.com', 'OTSO'], ['PROPEL'])).toEqual(['caseyagollan.com', 'OTSO']);
		// A word added again with other capitals takes the new spelling.
		expect(await readWords(store)).toEqual(['caseyagollan.com', 'OTSO']);
		expect([...store.kept.keys()]).toEqual(['private/voice/words.json']);
	});

	test('nobody but the signed-in owner can read or change them', async () => {
		const store = bucket();
		await changeWords(store, ['Otso'], []);
		const event = (method: string) => ({ request: new Request('https://caseyagollan.com/api/tables/voice/words', { method, headers: { origin: 'https://caseyagollan.com', 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ add: ['x'] }) } : {}) }), platform: { env: { PUBLISHING_STATE: store } }, url: new URL('https://caseyagollan.com/api/tables/voice/words') }) as never;
		const read = await GET(event('GET'));
		expect(read.status).toBe(404);
		expect(await read.text()).not.toContain('Otso');
		expect((await POST(event('POST'))).status).toBe(404);
		expect(await readWords(store)).toEqual(['Otso']);
	});
});
