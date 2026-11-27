import { describe, expect, test } from 'bun:test';
import { chatExtension } from '../src/lib/server/chat/tools';
import { localBackend } from '../src/lib/server/sources/access';
import { document, memoryIndex } from './helpers/sources';

const NOW = '2026-11-27T12:00:00.000Z';

function filled() {
	const index = memoryIndex();
	index.upsert([
		document({ id: 'kettles', title: 'On kettles', url: 'https://example.com/kettles', text: `Kettles whistle. ${'The quiet machine boils water. '.repeat(30)} The secret ending mentions marmalade.`, tags: ['tea'], places: ['Archive'], created: '2026-11-25T10:00:00.000Z', image: 'https://example.com/kettle.jpg', ref: 'readwise:document:kettles' }),
		document({ id: 'old', title: 'An old piece on kettles', text: 'Kettles of long ago.', created: '2025-01-05T10:00:00.000Z' }),
		document({ id: 'b1', source: 'arena', kind: 'image', title: 'A private kettle picture', url: 'https://www.are.na/block/1', private: true, places: ['Kitchen'], created: '2026-11-26T10:00:00.000Z' })
	], NOW);
	index.upsertHighlights([{ id: 'h1', parent: 'kettles', text: 'The kettle is the calmest machine.' }], 'readwise');
	for (const source of ['readwise', 'raindrop', 'arena']) index.setState(`sync:${source}`, { finished: NOW, since: NOW });
	return index;
}

function tools(options: { owner?: boolean; cached?: boolean; ops?: { op: string; blocks?: unknown[] }[]; asked?: string[] } = {}) {
	const index = filled();
	const savesFetch = (async (input: RequestInfo | URL) => { options.asked?.push(String(input)); return Response.json({ results: [], items: [], data: [] }); }) as typeof fetch;
	const thread = { table: () => 'abc123', tableOp: async (op: { op: string; blocks?: unknown[] }) => { options.ops?.push(op); return { added: (op.blocks ?? []).map((_block, at) => `s${at}`) }; }, tableItems: async () => [] };
	const extension = chatExtension({
		env: { READWISE_ACCESS_TOKEN: 'token' } as never, origin: () => 'https://caseyagollan.com/', thread: thread as never, onlyOwner: options.owner === undefined ? undefined : () => options.owner!,
		savesFetch, now: () => new Date(NOW), sources: () => (options.cached === false ? null : localBackend(index, { READWISE_ACCESS_TOKEN: 'token', RAINDROP_TOKEN: 'token' })), maxTurns: 8
	});
	const tool = (name: string) => extension.tools!.find((one) => one.name === name)!;
	const call = async (name: string, args: Record<string, unknown>) => { const result = await (tool(name).execute as (args: unknown, api: unknown, context: unknown) => Promise<{ output: { text: string }[]; isError?: boolean }>)(args, {}, {}); return { text: result.output.map((part) => part.text).join(''), error: result.isError === true }; };
	return { extension, call };
}

describe('my_saves over the site’s own copy', () => {
	test('one call searches every source, whole texts and highlights included, without asking any service', async () => {
		const asked: string[] = [];
		const { call } = tools({ owner: true, asked });
		const found = JSON.parse((await call('my_saves', { query: 'kettles' })).text);
		expect(found.items.map((item: { id: string }) => item.id).sort()).toEqual(['arena:b1', 'readwise:kettles', 'readwise:old']);
		const deep = JSON.parse((await call('my_saves', { query: 'calmest machine' })).text);
		expect(deep.items[0]).toMatchObject({ id: 'readwise:kettles', source: 'Readwise', url: 'https://example.com/kettles' });
		expect(asked).toEqual([]);
	});

	test('by date with no query, by source, and one item whole', async () => {
		const { call } = tools({ owner: true });
		const week = JSON.parse((await call('my_saves', { days: 7 })).text);
		expect(week.items.map((item: { id: string }) => item.id)).toEqual(['arena:b1', 'readwise:kettles']);
		expect(week.items[0].private).toBe(true);
		const readwise = JSON.parse((await call('my_saves', { days: 7, source: 'readwise' })).text);
		expect(readwise.items.map((item: { id: string }) => item.id)).toEqual(['readwise:kettles']);
		const whole = (await call('my_saves', { item: 'readwise:kettles' })).text;
		expect(whole).toContain('marmalade');
		expect(whole).toContain('The kettle is the calmest machine.');
	});

	test('without the copy it asks the service, as before', async () => {
		const asked: string[] = [];
		const { call } = tools({ owner: true, cached: false, asked });
		await call('my_saves', { source: 'readwise', query: 'kettles' });
		expect(asked.some((url) => url.startsWith('https://readwise.io/'))).toBe(true);
	});

	test('nobody but Casey gets the tool: a call made in anyone else’s run is refused before it runs', async () => {
		const blocked = async (owner: boolean) => {
			const { extension } = tools({ owner });
			const hooks = extension.hooks as unknown as { handlers: { beforeTool?: (call: unknown, api: unknown, context: unknown) => Promise<{ block?: string } | undefined> } }[];
			return (await Promise.all(hooks.map((hook) => hook.handlers.beforeTool?.({ name: 'my_saves', arguments: { query: 'kettles' } }, { conversationId: 'c', snapshot: async () => ({ run: { turns: 0, first: 'e1' } }), entries: async () => ({ items: [] }) }, {})))).find((answer) => answer?.block)?.block;
		};
		expect(await blocked(false)).toContain('Only Casey');
		expect(await blocked(true)).toBeUndefined();
	});

	test('table_add with `saved` puts a copy of the few shown fields on the table', async () => {
		const ops: { op: string; blocks?: Record<string, unknown>[] }[] = [];
		const { call } = tools({ owner: true, ops: ops as never });
		const answer = await call('table_add', { items: [{ saved: 'readwise:kettles' }, { saved: 'arena:b1' }] });
		expect(answer.error).toBe(false);
		const blocks = ops.flatMap((op) => op.blocks ?? []);
		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toMatchObject({ kind: 'link', url: 'https://example.com/kettles', title: 'On kettles', image: 'https://example.com/kettle.jpg' });
		expect(JSON.stringify(blocks)).not.toContain('marmalade');
		expect(String(blocks[1].meta)).toStartWith('Private');
		expect(answer.text.toLowerCase()).toContain('private');
	});
});
