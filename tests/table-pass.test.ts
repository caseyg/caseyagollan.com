import { describe, expect, test } from 'bun:test';
import { keepPass, KEPT_TTL, LINK_TTL, PASS_COOKIE, passFor, passLink, passMayEdit, readPass } from '../src/lib/server/table-pass';

const ORIGIN = 'https://caseyagollan.com';
const NOW = Date.parse('2026-11-27T20:00:00Z');

function bucket() {
	const files: Record<string, string> = {};
	return {
		files,
		get: async (key: string) => (key in files ? { json: async () => JSON.parse(files[key]) } : null),
		put: async (key: string, value: string) => void (files[key] = value),
		delete: async (key: string) => void delete files[key]
	} as never as R2Bucket & { files: Record<string, string> };
}
const tokenOf = (link: string) => new URL(link).searchParams.get('pass')!;
const visit = (cookie?: string, init: RequestInit = {}) => new Request(`${ORIGIN}/api/tables/calm1234`, { ...init, headers: { ...(cookie ? { cookie: `other=1; ${PASS_COOKIE}=${cookie}` } : {}), ...init.headers } });

describe('table passes', () => {
	test('a link opens its table for half an hour, and only a hash of it is kept', async () => {
		const store = bucket();
		const link = await passLink(store, ORIGIN, 'calm1234', true, NOW);
		expect(link).toMatch(/^https:\/\/caseyagollan\.com\/tables\/calm1234\?pass=[\w-]{43}$/);
		expect(Object.keys(store.files)[0]).toMatch(/^private\/tables\/passes\/[0-9a-f]{64}\.json$/);
		expect(JSON.stringify(store.files)).not.toContain(tokenOf(link));
		expect(await readPass(store, tokenOf(link), NOW + LINK_TTL - 1)).toMatchObject({ table: 'calm1234', edit: true, kind: 'link' });
		expect(await readPass(store, tokenOf(link), NOW + LINK_TTL)).toBeNull();
		// Once it has run out it is gone, not only refused.
		expect(Object.keys(store.files)).toEqual([]);
		expect(await readPass(store, 'x'.repeat(43), NOW)).toBeNull();
		expect(await readPass(store, '../../tables/index', NOW)).toBeNull();
	});

	test('the browser that opens a link keeps a pass to that table for a week', async () => {
		const store = bucket();
		const link = await passLink(store, ORIGIN, 'calm1234', true, NOW);
		expect(await keepPass(store, visit(), 'maps5678', tokenOf(link), NOW)).toBeNull();
		expect(await keepPass(store, visit(), 'calm1234', 'y'.repeat(43), NOW)).toBeNull();
		const cookie = (await keepPass(store, visit(), 'calm1234', tokenOf(link), NOW))!;
		expect(cookie).toMatch(/^[\w-]{43}$/);
		expect(await passFor(visit(cookie), store, 'calm1234', NOW)).toMatchObject({ edit: true });
		expect(await passFor(visit(cookie), store, 'maps5678', NOW)).toBeNull();
		expect(await passFor(visit(), store, 'calm1234', NOW)).toBeNull();
		// What the browser keeps is not a link, and a link is not a kept pass.
		expect(await keepPass(store, visit(), 'calm1234', cookie, NOW)).toBeNull();
		expect(await passFor(visit(tokenOf(link)), store, 'calm1234', NOW)).toBeNull();
		// A second table's pass sits beside the first.
		const both = (await keepPass(store, visit(cookie), 'maps5678', tokenOf(await passLink(store, ORIGIN, 'maps5678', false, NOW)), NOW))!;
		expect(await passFor(visit(both), store, 'calm1234', NOW)).toMatchObject({ edit: true });
		expect(await passFor(visit(both), store, 'maps5678', NOW)).toMatchObject({ edit: false });
		expect(await passFor(visit(both), store, 'calm1234', NOW + KEPT_TTL - 1)).toMatchObject({ edit: true });
		expect(await passFor(visit(cookie), store, 'calm1234', NOW + KEPT_TTL)).toBeNull();
	});

	test('a change needs an editing pass, its CSRF token, and to come from the site’s own page', async () => {
		const store = bucket();
		const editing = (await keepPass(store, visit(), 'calm1234', tokenOf(await passLink(store, ORIGIN, 'calm1234', true, NOW)), NOW))!;
		const { csrf } = (await passFor(visit(editing), store, 'calm1234', NOW))!;
		const put = (cookie: string, headers: Record<string, string>) => passMayEdit(visit(cookie, { method: 'PUT', headers }), store, 'calm1234', NOW);
		expect(await put(editing, { 'x-csrf-token': csrf, origin: ORIGIN })).toBe(true);
		expect(await put(editing, { 'x-csrf-token': csrf })).toBe(true);
		expect(await put(editing, { origin: ORIGIN })).toBe(false);
		expect(await put(editing, { 'x-csrf-token': 'guess', origin: ORIGIN })).toBe(false);
		expect(await put(editing, { 'x-csrf-token': csrf, origin: 'https://elsewhere.example' })).toBe(false);
		expect(await passMayEdit(visit(editing, { method: 'PUT', headers: { 'x-csrf-token': csrf } }), store, 'maps5678', NOW)).toBe(false);
		const looking = (await keepPass(store, visit(), 'calm1234', tokenOf(await passLink(store, ORIGIN, 'calm1234', false, NOW)), NOW))!;
		const seen = (await passFor(visit(looking), store, 'calm1234', NOW))!;
		expect(await put(looking, { 'x-csrf-token': seen.csrf, origin: ORIGIN })).toBe(false);
	});
});
