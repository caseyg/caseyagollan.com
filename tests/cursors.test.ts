import { describe, expect, test } from 'bun:test';
import { CHAT_MAX_LENGTH, cleanChat, countryFlag, cursorColor, cursorInk, cursorRoom, cursorsAllowed, CURSOR_COLORS, parseClientMessage } from '../src/lib/cursors';

describe('cursor messages', () => {
	test('reads moves and clamps them to the page', () => {
		expect(parseClientMessage(JSON.stringify({ type: 'move', x: 0.5, y: 300 }))).toEqual({ type: 'move', x: 0.5, y: 300 });
		expect(parseClientMessage(JSON.stringify({ type: 'move', x: 4, y: -10 }))).toEqual({ type: 'move', x: 1, y: 0 });
	});

	test('drops anything malformed', () => {
		for (const raw of ['nope', '{}', '[]', 'null', JSON.stringify({ type: 'move', x: 'a', y: 1 }), JSON.stringify({ type: 'chat', message: 3 }), 'x'.repeat(600), 42]) {
			expect(parseClientMessage(raw)).toBeNull();
		}
	});

	test('keeps chat to one short line of text', () => {
		expect(cleanChat('  hi\nthere‮\u0007 ')).toBe('hi there ');
		expect([...cleanChat('😀'.repeat(100))].length).toBe(CHAT_MAX_LENGTH);
		expect(parseClientMessage(JSON.stringify({ type: 'chat', message: '<b>hi</b>' }))).toEqual({ type: 'chat', message: '<b>hi</b>' });
	});
});

describe('cursor rooms', () => {
	test('one room per page, whatever its trailing slash', () => {
		expect(cursorRoom('/')).toBe('/');
		expect(cursorRoom('/library/')).toBe('/library');
		expect(cursorRoom('/library')).toBe('/library');
	});

	test("the owner's tools have no cursors", () => {
		for (const path of ['/new', '/new/note', '/editor', '/account', '/2026/11/18/post/edit', '/2026/11/18/post/syndicate/']) expect(cursorsAllowed(path)).toBe(false);
		for (const path of ['/', '/library/', '/posts/', '/2026/11/18/post/', '/wiki/news']) expect(cursorsAllowed(path)).toBe(true);
	});

	test('colors are steady and readable', () => {
		expect(cursorColor('abc')).toBe(cursorColor('abc'));
		expect(CURSOR_COLORS as readonly string[]).toContain(cursorColor('xyz'));
		expect(cursorInk('#ffffff')).toBe('#1a1a1a');
		expect(cursorInk('#b26bff')).toBe('#fff');
		expect(countryFlag('US')).toBe('🇺🇸');
		expect(countryFlag('XX')).toBe('');
		expect(countryFlag(undefined)).toBe('');
	});
});
