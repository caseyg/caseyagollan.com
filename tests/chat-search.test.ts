import { describe, expect, test } from 'bun:test';
import { chatDateGroup, chatSearchDoc, groupChatsByDate, plainChatText, searchChats, type ChatSearchDoc } from '../src/lib/chat-search';

const docs: ChatSearchDoc[] = [
	{ id: 'aaaaaaaaaa', title: 'Calm technology are.na canvas', updatedAt: 3, messages: [{ role: 'user', text: 'Put my calm technology channel on a table' }, { role: 'assistant', text: 'I added 28 blocks, including Sherry Turkle and Don Norman on living with complexity, to the canvas.' }] },
	{ id: 'bbbbbbbbbb', title: 'What’s new this week', updatedAt: 2, messages: [{ role: 'assistant', text: 'This week you posted about calm technology and a recipe for focaccia.' }] },
	{ id: 'cccccccccc', title: 'Link to the tables page', updatedAt: 1, messages: [{ role: 'user', text: 'where is the tables page' }] }
];

describe('searchChats', () => {
	test('finds a chat by its title', () => {
		expect(searchChats(docs, 'tables page').map((result) => result.id)).toEqual(['cccccccccc']);
	});

	test('finds words only said in the conversation, with the passage and who said it', () => {
		const [result] = searchChats(docs, 'focaccia');
		expect(result.id).toBe('bbbbbbbbbb');
		expect(result.by).toBe('assistant');
		expect(result.excerpt).toContain('focaccia');
	});

	test('a title match comes before a conversation match', () => {
		expect(searchChats(docs, 'calm technology').map((result) => result.id)).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb']);
	});

	test('every word has to be somewhere in the chat, in any case', () => {
		expect(searchChats(docs, 'TURKLE canvas').map((result) => result.id)).toEqual(['aaaaaaaaaa']);
		expect(searchChats(docs, 'turkle focaccia')).toEqual([]);
		expect(searchChats(docs, '  ')).toEqual([]);
	});

	test('long messages are cut to a passage around the match', () => {
		const long: ChatSearchDoc = { id: 'dddddddddd', title: 'Long', updatedAt: 1, messages: [{ role: 'assistant', text: `${'filler words '.repeat(60)}the needle is here ${'more filler '.repeat(60)}` }] };
		const [result] = searchChats([long], 'needle');
		expect(result.excerpt!.length).toBeLessThan(220);
		expect(result.excerpt).toContain('needle');
		expect(result.excerpt!.startsWith('…')).toBe(true);
	});
});

test('plainChatText keeps the words of Markdown', () => {
	expect(plainChatText('**Bold** and [a link](https://example.com/x) with `code`\n\n- item')).toBe('Bold and a link with code - item');
});

test('chatSearchDoc leaves out empty messages', () => {
	const doc = chatSearchDoc({ id: 'aaaaaaaaaa', title: 'T', updatedAt: 1 }, [
		{ id: '1', role: 'user', content: 'Hello **there**', status: 'done', createdAt: 1 },
		{ id: '2', role: 'assistant', content: '', status: 'streaming', createdAt: 2 }
	]);
	expect(doc.messages).toEqual([{ role: 'user', text: 'Hello there' }]);
});

describe('date groups', () => {
	const now = new Date(2026, 10, 25, 22, 0).getTime();
	const at = (daysAgo: number, hour = 12) => new Date(2026, 10, 25 - daysAgo, hour).getTime();

	test('names the day, the week, the month, then the month by name', () => {
		expect(chatDateGroup(at(0, 1), now)).toBe('Today');
		expect(chatDateGroup(at(1, 23), now)).toBe('Yesterday');
		expect(chatDateGroup(at(5), now)).toBe('Previous 7 days');
		expect(chatDateGroup(at(20), now)).toBe('Previous 30 days');
		expect(chatDateGroup(at(60), now)).toBe('September 2026');
	});

	test('groups keep the order they were given', () => {
		const groups = groupChatsByDate([{ updatedAt: at(0) }, { updatedAt: at(0, 2) }, { updatedAt: at(1) }], now);
		expect(groups.map((group) => [group.label, group.threads.length])).toEqual([['Today', 2], ['Yesterday', 1]]);
	});
});

describe('searchThreads', () => {
	const summary = (id: string, title: string, updatedAt: number) => ({ id, title, createdAt: 1, updatedAt, messageCount: 2 });
	function bucket(objects: Record<string, unknown>) {
		const puts: string[] = [];
		return {
			puts,
			async list({ prefix }: { prefix: string }) {
				return { truncated: false, objects: Object.keys(objects).filter((key) => key.startsWith(prefix)).map((key) => ({ key, uploaded: new Date(1), customMetadata: { updatedAt: String((objects[key] as { updatedAt: number }).updatedAt) } })) };
			},
			async get(key: string) { return key in objects ? { json: async () => objects[key] } : null; },
			async put(key: string, value: string) { puts.push(key); objects[key] = JSON.parse(value); }
		};
	}

	test('reads saved search docs, and fills in a thread that has none from the thread itself', async () => {
		const { searchThreads } = await import('../src/lib/server/chat/threads');
		const store = bucket({
			'chat/threads/aaaaaaaaaa.json': summary('aaaaaaaaaa', 'Calm technology', 5),
			'chat/threads/bbbbbbbbbb.json': summary('bbbbbbbbbb', 'Older chat', 4),
			'chat/search/aaaaaaaaaa.json': { id: 'aaaaaaaaaa', title: 'Calm technology', updatedAt: 5, messages: [{ role: 'assistant', text: 'Sherry Turkle wrote Alone Together.' }] }
		});
		const asked: string[] = [];
		const env = {
			PUBLISHING_STATE: store,
			ChatThread: { getByName: (id: string) => ({ snapshot: async () => { asked.push(id); return { thread: summary(id, 'Older chat', 4), messages: [{ id: '1', role: 'user', content: 'Tell me about **focaccia**', status: 'done', createdAt: 1 }] }; } }) }
		} as never;
		expect((await searchThreads(env, 'turkle')).map((result) => result.id)).toEqual(['aaaaaaaaaa']);
		expect((await searchThreads(env, 'focaccia')).map((result) => result.id)).toEqual(['bbbbbbbbbb']);
		expect(store.puts).toEqual(['chat/search/bbbbbbbbbb.json']);
		// The second search read the saved doc, not the thread.
		expect(asked).toEqual(['bbbbbbbbbb']);
	});
});
