import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ChatMessage, ChatServerEvent, ChatViewer } from '../src/lib/chat';
import { LiveThread } from '../src/lib/chat-client.svelte';

const casey: ChatViewer = { id: 'web:https://caseyagollan.com/', name: 'Casey Gollan', via: 'owner', owner: true };

/** A socket the test opens and speaks through. */
class FakeSocket {
	static OPEN = 1;
	static last?: FakeSocket;
	readyState = 0;
	sent: string[] = [];
	onopen?: () => void;
	onmessage?: (event: { data: string }) => void;
	onclose?: () => void;
	constructor(public url: URL) { FakeSocket.last = this; }
	send(data: string) { this.sent.push(data); }
	close() { this.readyState = 3; }
	open() { this.readyState = 1; this.onopen?.(); }
	say(event: ChatServerEvent) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

const real = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, location: (globalThis as { location?: unknown }).location };
let posted: { text?: string; say?: string }[] = [];
let answer: () => Response | Promise<Response> = () => Response.json({ id: 'abcde12345' });

beforeEach(() => {
	posted = [];
	answer = () => Response.json({ id: 'abcde12345' });
	FakeSocket.last = undefined;
	Object.assign(globalThis, {
		WebSocket: FakeSocket,
		location: { href: 'https://caseyagollan.com/chat' },
		fetch: async (_url: string, init: RequestInit) => { posted.push(JSON.parse(String(init.body))); return answer(); }
	});
});
afterEach(() => { Object.assign(globalThis, real); });

const summary = (id: string) => ({ id, title: 'Cooperatives', createdAt: 1, updatedAt: 1, messageCount: 1 });

describe('a chat begun before its thread is made', () => {
	test('shows the message and an answer on its way without asking the server anything', () => {
		const thread = LiveThread.begin(casey, 'What have I written about cooperatives?');
		expect(posted).toEqual([]);
		expect(FakeSocket.last).toBeUndefined();
		expect(thread.starting).toBe(true);
		expect(thread.snapshot.thread.title).toBe('What have I written about cooperatives?');
		const [mine, coming] = thread.messages;
		expect(mine).toMatchObject({ role: 'user', content: 'What have I written about cooperatives?', status: 'done', author: { id: casey.id } });
		expect(coming).toMatchObject({ id: `r-${mine.id}`, role: 'assistant', content: '', status: 'streaming' });
		// Not a chat yet: nothing to connect to.
		thread.connect();
		expect(FakeSocket.last).toBeUndefined();
	});

	test('start makes the thread under the id the message is shown as, then connects to it', async () => {
		let changes = 0;
		const thread = LiveThread.begin(casey, 'Hello', () => changes++);
		const said = thread.messages[0].id;
		expect(await thread.start()).toEqual({ id: 'abcde12345' });
		expect(posted).toEqual([{ text: 'Hello', say: said }]);
		expect(thread.starting).toBe(false);
		expect(String(FakeSocket.last?.url)).toBe('wss://caseyagollan.com/agents/chat-thread/abcde12345');
		expect(changes).toBe(1);
		// Asked twice, it is made once.
		expect(await thread.start()).toEqual({ id: 'abcde12345' });
		expect(posted).toHaveLength(1);
	});

	test('the answer keeps showing as on its way until the thread sends it, then is that answer', async () => {
		const thread = LiveThread.begin(casey, 'Hello');
		const said = thread.messages[0].id;
		await thread.start();
		const socket = FakeSocket.last!;
		socket.open();
		const mine: ChatMessage = { id: said, role: 'user', content: 'Hello', status: 'done', createdAt: 5 };
		// The thread has the message but hasn't begun its answer.
		socket.say({ type: 'chat:snapshot', snapshot: { thread: summary('abcde12345'), messages: [mine] }, viewer: casey, tools: [] });
		expect(thread.messages.map((message) => [message.id, message.status])).toEqual([[said, 'done'], [`r-${said}`, 'streaming']]);
		socket.say({ type: 'chat:message', message: { id: `r-${said}`, role: 'assistant', content: 'Hi', model: 'glm', status: 'streaming', createdAt: 6 } });
		expect(thread.messages).toHaveLength(2);
		expect(thread.messages[1]).toMatchObject({ content: 'Hi', model: 'glm' });
		// A later snapshot without it (it can't happen, but a reconnect must not bring the dots back).
		socket.say({ type: 'chat:snapshot', snapshot: { thread: summary('abcde12345'), messages: [mine, { id: `r-${said}`, role: 'assistant', content: 'Hi there', status: 'done', createdAt: 6 }, { id: 'later', role: 'user', content: 'More', status: 'done', createdAt: 7 }] }, viewer: casey, tools: [] });
		expect(thread.messages.map((message) => message.id)).toEqual([said, `r-${said}`, 'later']);
	});

	test('a thread that already answered is shown as it is', async () => {
		const thread = LiveThread.begin(casey, 'Hello');
		const said = thread.messages[0].id;
		await thread.start();
		FakeSocket.last!.open();
		FakeSocket.last!.say({ type: 'chat:snapshot', snapshot: { thread: summary('abcde12345'), messages: [{ id: said, role: 'user', content: 'Hello', status: 'done', createdAt: 5 }, { id: `r-${said}`, role: 'assistant', content: '*The answer stopped: something went wrong.*', status: 'failed', createdAt: 6 }] }, viewer: casey, tools: [] });
		expect(thread.messages.map((message) => message.status)).toEqual(['done', 'failed']);
	});

	test('when it can’t be made, start gives the reason and the words back', async () => {
		answer = () => Response.json({ error: 'Chat isn’t available here.' }, { status: 503 });
		const thread = LiveThread.begin(casey, 'Keep these words');
		expect(await thread.start()).toEqual({ error: 'Chat isn’t available here.', text: 'Keep these words' });
		expect(thread.starting).toBe(true);
		expect(FakeSocket.last).toBeUndefined();

		answer = () => { throw new TypeError('Failed to fetch'); };
		const offline = LiveThread.begin(casey, 'Offline words');
		expect(await offline.start()).toEqual({ error: 'That didn’t send: the site couldn’t be reached.', text: 'Offline words' });

		// Something that isn't a chat's id is not taken for one.
		answer = () => Response.json({ id: '../elsewhere' });
		expect(await LiveThread.begin(casey, 'Odd').start()).toMatchObject({ error: 'That didn’t send.' });
	});

	test('a chat left before it was made does not connect', async () => {
		const thread = LiveThread.begin(casey, 'Hello');
		const starting = thread.start();
		thread.close();
		await starting;
		expect(FakeSocket.last).toBeUndefined();
	});
});
