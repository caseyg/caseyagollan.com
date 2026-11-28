/**
 * What Casey asked of the cache: only Casey can read it, and what is published from it is only
 * what is shown. Each rule in `src/lib/server/sources/access.ts` has a test here.
 */
import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { isOwnerTool } from '../src/lib/server/chat/tools';
import { isPrivateTool } from '../src/lib/server/chat/projection';
import { localBackend, sourceBackend, sourceBlock, sourcesFor } from '../src/lib/server/sources/access';
import { GET, POST } from '../src/routes/api/sources/+server';
import { rawKey } from '../src/lib/server/sources/sync';
import { document, memoryIndex } from './helpers/sources';

function filled() {
	const index = memoryIndex();
	index.upsert([
		document({ id: 'article', ref: 'readwise:document:article', title: 'A private article about kettles', text: 'The whole text, which nobody else should read. Kettles.', note: 'My own note', tags: ['secret-tag'], places: ['Inbox'], highlights: [{ id: 'h', text: 'A highlighted line', note: 'private thought' }] }),
		document({ id: 'drop', source: 'raindrop', kind: 'link', title: 'A bookmark about kettles', summary: 'Kettles, bookmarked', places: ['Private collection'] }),
		document({ id: '1', source: 'arena', kind: 'image', title: 'Public kettle', private: false, image: 'https://images.example/kettle.jpg', url: 'https://www.are.na/block/1', places: ['Secret channel'], tags: [] }),
		document({ id: '2', source: 'arena', kind: 'text', title: 'Private kettle plans', private: true, url: 'https://www.are.na/block/2', text: 'Plans for kettles' })
	]);
	index.saveVector('readwise:article', 'text', [1, 0]);
	index.saveVector('arena:1', 'image', [0.9, 0.1]);
	index.saveVector('arena:2', 'text', [0.8, 0.2]);
	return index;
}

describe('the source cache is for the owner', () => {
	test('a reader who isn’t the owner gets only what a plugin marked public', async () => {
		const index = filled();
		const visitor = sourcesFor(localBackend(index), { owner: false })!;
		const found = await visitor.search({ query: 'kettle kettles' });
		expect(found.hits.map((hit) => hit.key)).toEqual(['arena:1']);
		expect(found.total).toBe(1);
		// Listing by date, filtering, reading by key or address, and likeness all hold to it.
		expect((await visitor.search({})).hits.map((hit) => hit.key)).toEqual(['arena:1']);
		expect((await visitor.search({ source: 'readwise' })).total).toBe(0);
		expect(await visitor.get('readwise:article')).toBeNull();
		expect(await visitor.get('https://example.com/article')).toBeNull();
		expect(await visitor.get('arena:2')).toBeNull();
		expect((await visitor.similar({ like: 'arena:1' })).map((hit) => hit.key)).toEqual([]);
		expect(await visitor.similar({ like: 'readwise:article' })).toEqual([]);
	});

	test('where things are kept and how they are tagged is never told to anyone else', async () => {
		const visitor = sourcesFor(localBackend(filled()), { owner: false })!;
		const [hit] = (await visitor.search({ query: 'kettle' })).hits;
		expect(hit.places).toEqual([]);
		expect(hit.tags).toEqual([]);
		expect(await visitor.places()).toEqual([]);
		// Asking by a private place or tag can't confirm that it exists.
		expect((await visitor.search({ place: 'Secret channel' })).total).toBe(0);
		expect((await visitor.search({ tag: 'secret-tag' })).total).toBe(0);
	});

	test('owner means exactly true: anything else reads as a visitor', async () => {
		const index = filled();
		for (const owner of [undefined, null, 'true', 1, {}] as never[]) {
			expect(index.search({ owner, query: 'kettles' }).hits.every((hit) => !hit.private)).toBe(true);
			expect(index.get('readwise:article', { owner })).toBeNull();
			expect(sourcesFor(localBackend(index), { owner })!.owner).toBe(false);
		}
		expect(index.search({ owner: true, query: 'kettles' }).total).toBe(4);
	});

	test('the owner reads everything, and likeness leaves out what a reader may not see', async () => {
		const index = filled();
		const owner = sourcesFor(localBackend(index), { owner: true })!;
		expect((await owner.similar({ like: 'readwise:article' })).map((hit) => hit.key)).toEqual(['arena:1', 'arena:2']);
		expect((await owner.get('readwise:article'))!.allHighlights[0].note).toBe('private thought');
	});

	test('the chat tool that reads the cache is withheld from anyone but Casey, and its results stay out of the steps', () => {
		expect(isOwnerTool('my_saves')).toBe(true);
		expect(isPrivateTool('my_saves')).toBe(true);
	});

	test('the only endpoint refuses anyone who isn’t signed in as the owner, before touching the cache', async () => {
		let touched = 0;
		const env = { SOURCES: { idFromName: () => { touched++; return 'id'; }, get: () => { touched++; return {}; } } };
		const event = (method: string, path: string) => ({ request: new Request(`https://caseyagollan.com${path}`, { method }), url: new URL(`https://caseyagollan.com${path}`), platform: { env } }) as never;
		for (const response of [await GET(event('GET', '/api/sources')), await GET(event('GET', '/api/sources?q=kettles')), await GET(event('GET', '/api/sources?since=2026-11-01T00:00:00Z')), await GET(event('GET', '/api/sources?like=arena:1&words=kettle')), await POST(event('POST', '/api/sources'))]) {
			expect(response.status).toBe(401);
			expect(response.headers.get('cache-control')).toContain('no-store');
			expect(await response.text()).not.toContain('kettle');
		}
		expect(touched).toBe(0);
	});

	test('no other route, page or build step reads the cache or its raw records', async () => {
		const walk = async (folder: string): Promise<string[]> => (await Promise.all((await readdir(folder, { withFileTypes: true })).map((entry) => entry.isDirectory() ? walk(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`]))).flat();
		const files = [...(await walk('src/routes')), ...(await walk('utils'))].filter((file) => /\.(ts|js|mjs|svelte)$/.test(file));
		const reaching: string[] = [];
		for (const file of files) {
			const source = await readFile(file, 'utf8');
			if (/server\/sources\/|private\/sources\/|env\.SOURCES|platform\?\.env\?\.SOURCES/.test(source)) reaching.push(file);
		}
		// The owner-only endpoint, and the two local tools (a sync for trying things out, the chat replay). Adding to this list needs the same care.
		expect(reaching.sort()).toEqual(['src/routes/api/sources/+server.ts', 'utils/chat-eval/run.ts', 'utils/sources/try.ts'].sort());
		// Raw records sit under `private/`, which nothing serves.
		expect(rawKey('readwise', '01abc')).toBe('private/sources/readwise/01abc.json');
		expect(rawKey('arena', '../../tables/x')).not.toContain('..');
	});

	test('with no binding there is no cache, rather than an open one', () => {
		expect(sourceBackend(undefined)).toBeNull();
		expect(sourceBackend({})).toBeNull();
		expect(sourcesFor(null, { owner: true })).toBeNull();
	});
});

describe('what a table or a post gets from the cache', () => {
	test('a block is a copy of what its card shows, and nothing else of the document', async () => {
		const owner = sourcesFor(localBackend(filled()), { owner: true })!;
		const [hit] = (await owner.search({ query: 'private article' })).hits;
		const block = sourceBlock(hit);
		expect(Object.keys(block).sort()).toEqual(['excerpt', 'icon', 'kind', 'meta', 'ref', 'title', 'url']);
		expect(block.title).toBe('A private article about kettles');
		expect(block.url).toBe('https://example.com/article');
		expect(block.excerpt!.length).toBeLessThanOrEqual(300);
		const published = JSON.stringify(block);
		// Not the note, the highlight's note, the tags, where it is kept, or a key into the cache.
		for (const hidden of ['My own note', 'private thought', 'secret-tag', 'Inbox', 'readwise:article']) expect(published).not.toContain(hidden);
	});

	test('a long text never rides along: the excerpt is cut', async () => {
		const index = memoryIndex();
		index.upsert([document({ id: 'long', title: 'Long', summary: 'word '.repeat(400) })]);
		const [hit] = index.search({ owner: true }).hits;
		expect(sourceBlock(hit).excerpt!.length).toBeLessThanOrEqual(300);
	});

	test('a private Are.na item’s card says it is private', async () => {
		const owner = sourcesFor(localBackend(filled()), { owner: true })!;
		const hit = (await owner.get('arena:2'))!;
		expect(sourceBlock(hit).meta).toStartWith('Private');
		expect(sourceBlock((await owner.get('arena:1'))!).meta).not.toContain('Private');
	});
});
