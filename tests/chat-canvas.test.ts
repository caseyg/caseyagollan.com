import { describe, expect, test } from 'bun:test';
import { canvasOrder, unansweredTable } from '../src/lib/server/chat/canvas';
import { chatPage } from '../src/lib/chat';

describe('which open table page takes the chat’s edits', () => {
	const order = (pages: { name: string; hidden?: boolean; active: number }[]) => canvasOrder(pages, (page) => page).map((page) => page.name);

	test('the tab in front goes before a background tab that reconnected later', () => {
		expect(order([{ name: 'front', active: 100 }, { name: 'background', hidden: true, active: 900 }])).toEqual(['front', 'background']);
	});

	test('among tabs in front, the one Casey used last', () => {
		expect(order([{ name: 'old', active: 1 }, { name: 'new', active: 2 }])).toEqual(['new', 'old']);
	});

	test('a background tab is still used when it is the only one', () => {
		expect(order([{ name: 'only', hidden: true, active: 1 }])).toEqual(['only']);
	});

	test('the page says when its tab is in the background', () => {
		expect(chatPage({ path: '/tables/abcd1234/', table: 'abcd1234', hidden: true })).toEqual({ path: '/tables/abcd1234/', table: 'abcd1234', hidden: true });
		expect(chatPage({ path: '/tables/abcd1234/', hidden: 'yes' })).toEqual({ path: '/tables/abcd1234/' });
	});

	test('the assistant hears what Casey should do, and that nothing changed', () => {
		expect(unansweredTable(true)).toContain('background tab');
		expect(unansweredTable(false)).toContain('nothing was changed');
	});
});
