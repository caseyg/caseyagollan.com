import { describe, expect, test } from 'bun:test';
import { isUntitled, nameLines, namePrompt, parseName, UNTITLED } from '../src/lib/table-names';
import { emptyTable, type Table } from '../src/lib/tables';
import { IDLE_MS, nameIdleTables, nameTable, nameUntitled, RECENT_MS } from '../src/lib/server/table-names';
import { listTables, readTable, writeTable } from '../src/lib/server/tables';

/** An R2 bucket in memory, with the etags a conditional write needs. */
function bucket() {
	const kept = new Map<string, { body: string; etag: string }>();
	let version = 0;
	return {
		kept,
		async get(key: string) {
			const found = kept.get(key);
			return found ? { etag: found.etag, json: async () => JSON.parse(found.body) } : null;
		},
		async put(key: string, body: string, options?: { onlyIf?: { etagMatches?: string } }) {
			const wanted = options?.onlyIf?.etagMatches;
			if (wanted !== undefined && kept.get(key)?.etag !== wanted) return null;
			kept.set(key, { body, etag: String(++version) });
			return {};
		}
	} as unknown as R2Bucket & { kept: Map<string, { body: string; etag: string }> };
}

const note = (id: string, text: string, y = 0) => ({ typeName: 'shape', id: `shape:${id}`, type: 'site-block', x: 0, y, props: { kind: 'link', url: 'https://example.com/', title: text } });
const doc = (...titles: string[]) => ({ schema: {}, store: Object.fromEntries(titles.map((title, index) => [`shape:${index}`, note(String(index), title, index)])) });
const table = (id: string, name: string, document: unknown, updated = '2026-11-28T12:00:00.000Z'): Table => ({ ...emptyTable(name, id, updated), document });

describe('table names', () => {
	test('only the name a table is made with counts as untitled', () => {
		expect(isUntitled({ name: UNTITLED })).toBe(true);
		expect(isUntitled({ name: ' untitled table ' })).toBe(true);
		expect(isUntitled({ name: 'Untitled table 2' })).toBe(false);
		expect(isUntitled({ name: 'Gardens' })).toBe(false);
	});

	test('reads a name out of an answer', () => {
		expect(parseName('Community gardens in Queens')).toBe('Community gardens in Queens');
		expect(parseName('"Mutual aid reading."\n\nI chose this because…')).toBe('Mutual aid reading');
		expect(parseName('<think>hmm</think>\n**Name:** Tool libraries')).toBe('Tool libraries');
		expect(parseName('')).toBeNull();
		expect(parseName('Untitled table')).toBeNull();
		expect(parseName('This canvas gathers many different things about a great many subjects indeed')).toBeNull();
	});

	test('the model reads what is on the table, and a table without words has nothing to read', () => {
		expect(nameLines(doc('Seed libraries', 'Tool libraries'))).toEqual(['🔗 Seed libraries', '🔗 Tool libraries']);
		expect(nameLines(null)).toEqual([]);
		expect(namePrompt(['🔗 Seed libraries']).user).toContain('Seed libraries');
	});
});

describe('naming saved tables', () => {
	test('names an untitled table with words, without touching when it changed', async () => {
		const r2 = bucket();
		await writeTable(r2, table('aaaa1', UNTITLED, doc('Seed libraries')));
		expect(await nameTable(r2, async () => 'Libraries of things', 'aaaa1')).toEqual({ state: 'named', name: 'Libraries of things' });
		const saved = await readTable(r2, 'aaaa1');
		expect(saved?.name).toBe('Libraries of things');
		expect(saved?.updated).toBe('2026-11-28T12:00:00.000Z');
		expect((await listTables(r2))[0].name).toBe('Libraries of things');
	});

	test('never changes a name that was set, and never asks for one', async () => {
		const r2 = bucket();
		await writeTable(r2, table('aaaa1', 'Gardens', doc('Seed libraries')));
		let asked = 0;
		expect(await nameTable(r2, async () => { asked++; return 'Other'; }, 'aaaa1')).toEqual({ state: 'kept', name: 'Gardens' });
		expect(asked).toBe(0);
	});

	test('a name typed while the model thought wins, and so does a canvas saved then', async () => {
		const r2 = bucket();
		await writeTable(r2, table('aaaa1', UNTITLED, doc('Seed libraries')));
		expect(await nameTable(r2, async () => { await writeTable(r2, table('aaaa1', 'Mine', doc('Seed libraries'))); return 'Theirs'; }, 'aaaa1')).toEqual({ state: 'kept', name: 'Mine' });
		await writeTable(r2, table('bbbb1', UNTITLED, doc('One')));
		await nameTable(r2, async () => { await writeTable(r2, table('bbbb1', UNTITLED, doc('One', 'Two'))); return 'Numbers'; }, 'bbbb1');
		const saved = await readTable(r2, 'bbbb1');
		expect(saved?.name).toBe('Numbers');
		expect(nameLines(saved?.document)).toHaveLength(2);
	});

	test('an empty table stays untitled', async () => {
		const r2 = bucket();
		await writeTable(r2, table('aaaa1', UNTITLED, null));
		expect(await nameTable(r2, async () => 'Nothing', 'aaaa1')).toEqual({ state: 'empty' });
	});

	test('the pass names tables left alone lately, not ones in use or from long ago', async () => {
		const r2 = bucket();
		const now = Date.parse('2026-11-28T12:00:00.000Z');
		const at = (ago: number) => new Date(now - ago).toISOString();
		await writeTable(r2, table('busy1', UNTITLED, doc('A'), at(IDLE_MS - 1000)));
		await writeTable(r2, table('left1', UNTITLED, doc('B'), at(IDLE_MS + 1000)));
		await writeTable(r2, table('old11', UNTITLED, doc('C'), at(RECENT_MS + 1000)));
		await writeTable(r2, table('mine1', 'Mine', doc('D'), at(IDLE_MS + 1000)));
		expect(await nameIdleTables({ PUBLISHING_STATE: r2 }, now, async (lines) => `About ${lines[0].slice(-1)}`)).toEqual({ named: 1, failed: 0 });
		const names = Object.fromEntries((await listTables(r2)).map((one) => [one.id, one.name]));
		expect(names).toEqual({ busy1: UNTITLED, left1: 'About B', old11: UNTITLED, mine1: 'Mine' });
	});

	test('a table with nothing to name it by is not read again until it changes', async () => {
		const r2 = bucket();
		const now = Date.parse('2026-11-28T12:00:00.000Z');
		await writeTable(r2, table('blank', UNTITLED, null, new Date(now - IDLE_MS - 1000).toISOString()));
		await nameIdleTables({ PUBLISHING_STATE: r2 }, now, async () => 'X');
		expect(await nameIdleTables({ PUBLISHING_STATE: r2 }, now, async () => 'X')).toEqual({ skipped: true, named: 0, failed: 0 });
	});

	test('asked for, every untitled table is named, a few at a time', async () => {
		const r2 = bucket();
		for (let index = 0; index < 8; index++) await writeTable(r2, table(`old1${index}`, UNTITLED, doc(`Thing ${index}`), '2026-01-01T00:00:00.000Z'));
		await writeTable(r2, table('mine1', 'Mine', doc('D'), '2026-01-01T00:00:00.000Z'));
		const ask = async (lines: string[]) => `About ${lines[0].slice(-1)}`;
		const first = await nameUntitled(r2, ask);
		expect(first.named).toHaveLength(6);
		expect(first.left).toBe(2);
		const second = await nameUntitled(r2, ask);
		expect(second).toMatchObject({ left: 0 });
		expect((await listTables(r2)).filter((one) => one.name === UNTITLED)).toHaveLength(0);
		expect((await listTables(r2)).find((one) => one.id === 'mine1')?.name).toBe('Mine');
	});

	test('stops asking when the model answers for none', async () => {
		const r2 = bucket();
		await writeTable(r2, table('old11', UNTITLED, doc('A')));
		expect(await nameUntitled(r2, async () => { throw new Error('down'); })).toEqual({ named: [], left: 0 });
	});
});
