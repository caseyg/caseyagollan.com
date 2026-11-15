import { describe, expect, test } from 'bun:test';
import { privateArena, privateBlock, searchArena } from '../src/lib/server/arena';
import type { ArenaItem } from '../src/lib/arena';

const user = { slug: 'casey-gollan' };
const items: ArenaItem[] = [
	{ id: 1, type: 'Text', visibility: 'private', state: 'available', created_at: '2026-01-01T00:00:00Z', content: { plain: 'secret garden notes' }, user },
	{ id: 2, type: 'Image', visibility: 'public', state: 'available', created_at: '2026-01-02T00:00:00Z', title: 'Garden', user },
	{ id: 3, type: 'Channel', visibility: 'private', state: 'available', slug: 'drafts', title: 'Drafts', updated_at: '2026-01-03T00:00:00Z', counts: { contents: 2 }, owner: user },
	{ id: 4, type: 'Link', visibility: 'private', state: 'available', title: 'Someone else’s', user: { slug: 'friend' } }
];

function bucket() {
	const objects = new Map<string, string>();
	return {
		objects,
		async get(key: string) {
			const value = objects.get(key);
			return value === undefined ? null : { json: async () => JSON.parse(value) };
		},
		async put(key: string, value: string) {
			objects.set(key, value);
		}
	} as unknown as R2Bucket & { objects: Map<string, string> };
}

describe('private Are.na for the owner', () => {
	test('keeps only Casey’s private items, and caches them', async () => {
		let calls = 0;
		let auth = null as string | null;
		const fetcher = (async (_url: string, init?: RequestInit) => {
			calls++;
			auth = new Headers(init?.headers).get('authorization');
			return Response.json({ data: items, meta: {} });
		}) as unknown as typeof fetch;
		const store = bucket();
		const env = { ARENA_PAT: 'pat', PUBLISHING_STATE: store };
		const documents = await privateArena(env, undefined, fetcher);
		expect(auth).toBe('Bearer pat');
		expect(documents.map((document) => document.url)).toEqual(['https://www.are.na/block/1', 'https://www.are.na/casey-gollan/drafts']);
		await privateArena(env, undefined, fetcher);
		expect(calls).toBe(1);
		expect(store.objects.has('arena/private.json')).toBe(true);
	});

	test('without the secret there is nothing private', async () => {
		expect(await privateArena({})).toEqual([]);
	});

	test('search needs every word, puts title matches first, and lists all for an empty query', async () => {
		const fetcher = (async () => Response.json({ data: items, meta: {} })) as unknown as typeof fetch;
		const documents = await privateArena({ ARENA_PAT: 'pat' }, undefined, fetcher);
		expect(searchArena(documents, 'garden secret').map((d) => d.url)).toEqual(['https://www.are.na/block/1']);
		expect(searchArena(documents, 'nothing')).toEqual([]);
		expect(searchArena(documents, '').map((d) => d.title)).toEqual(['Drafts', 'secret garden notes']);
	});

	test('blocks say they are private', async () => {
		const fetcher = (async () => Response.json({ data: items, meta: {} })) as unknown as typeof fetch;
		const [document] = await privateArena({ ARENA_PAT: 'pat' }, undefined, fetcher);
		expect(privateBlock(document)).toMatchObject({ kind: 'arena', meta: 'Private · Text', icon: '📝' });
	});
});
