/**
 * A /chat thread in the browser: the server-rendered snapshot, kept live over the
 * thread agent's WebSocket (`/agents/chat-thread/<id>`), reconnecting with backoff.
 */
import { CHAT_AGENT, CHAT_ID, chatAuthor, chatTitle, SELECTION_LISTED, type ChatClientEvent, type ChatPage, type ChatMessage, type ChatSelectionItem, type ChatServerEvent, type ChatSnapshot, type ChatThreadSummary, type ChatViewer } from '$lib/chat';
import type { TableCancelEvent, TableOpEvent, TableOpResult } from '$lib/table-agent';

export interface LiveThreadOptions {
	/** The assistant is taking this person to a page of the site. */
	onnavigate?: (path: string) => void;
	/** On Casey's table page: make a change the assistant asked for, and say how it went. */
	ontableop?: (event: TableOpEvent) => Promise<TableOpResult>;
	/** A message already shown was refused: it's gone from the thread, and this is its text to put back in the box. */
	onreturn?: (text: string) => void;
}

/** A message this browser shows before the thread has it. */
interface Unsent { text: string; selection?: ChatSelectionItem[]; queue: boolean }

const sayId = () => {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
};

/**
 * The list of chats, read again by a page that can't reload it: /chat showing a chat it has just
 * started is held there by its history entry's state, which reloading the page's data would clear.
 * `over` is the list it replaces (the layout's own); a newer one from the server wins again.
 */
class ChatList {
	// Raw, so `over` stays the very list it was given and can be told from a newer one.
	fresh = $state.raw<{ over: unknown; threads: ChatThreadSummary[] } | null>(null);
}
export const chatList = new ChatList();

export async function refreshChatList(over: unknown): Promise<void> {
	const response = await fetch('/api/chat?threads', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
	const body = (response?.ok ? await response.json().catch(() => null) : null) as { threads?: ChatThreadSummary[] } | null;
	if (Array.isArray(body?.threads)) chatList.fresh = { over, threads: body.threads };
}

export type LiveStatus = 'connecting' | 'live' | 'offline';

/** The id the thread gives its answer to a message (see `projectMessages`). */
const replyId = (said: string) => `r-${said}`;
/** An answer that is on its way and has no words yet: the three dots. */
const thinkingMessage = (id: string, createdAt = Date.now()): ChatMessage => ({ id, role: 'assistant', content: '', status: 'streaming', createdAt });

export class LiveThread {
	snapshot = $state<ChatSnapshot>() as ChatSnapshot;
	viewer = $state<ChatViewer | null>(null);
	tools = $state<string[]>([]);
	/** Casey's Tools menu: the groups of tools in this chat and what is off. Null for anyone else. */
	choices = $state<import('./chat-tool-groups').ChatToolChoices | null>(null);
	/** Casey's Model menu: the models this chat could answer with and the one it does. Null for anyone else, or with only one. */
	models = $state<import('./chat-models').ChatModelChoices | null>(null);
	status = $state<LiveStatus>('connecting');
	error = $state('');
	/** The chat was deleted while this page had it open. */
	removed = $state(false);

	#socket?: WebSocket;
	#retry = 0;
	#timer?: ReturnType<typeof setTimeout>;
	#closed = false;

	/** Streamed text not yet shown, by message id; shown once a frame (see #receive). */
	#pending = new Map<string, string>();
	#frame = 0;

	/** Messages shown here that the thread hasn't sent back yet, by id, oldest first. */
	#unsent = new Map<string, Unsent>();

	#page?: ChatPage;
	/** Changes the thread gave up waiting for before this page got to them. */
	#cancelled = new Set<string>();
	#onchange?: () => void;
	#options: LiveThreadOptions;

	/** A chat begun here (`begin`) whose thread isn't made yet: its first message, by the id it is shown under. */
	#first?: { id: string; text: string };
	/** The answer shown as on its way before the thread has said anything of it, by id. */
	#thinking?: string;

	/** `onchange` runs when the thread's place in a list would move: a new message, a new title, or a finished answer. */
	constructor(snapshot: ChatSnapshot, viewer: ChatViewer | null, onchange?: () => void, options: LiveThreadOptions = {}) {
		this.snapshot = snapshot;
		this.viewer = viewer;
		this.#onchange = onchange;
		this.#options = options;
	}

	get messages(): ChatMessage[] { return this.snapshot.messages; }

	/**
	 * A chat that doesn't exist yet, shown as if it did: its first message and the answer on its way.
	 * Nothing is asked of the server until `start`, so the page can show it the moment Send is pressed.
	 */
	static begin(viewer: ChatViewer, text: string, onchange?: () => void, options: LiveThreadOptions = {}): LiveThread {
		const id = sayId(), now = Date.now(), author = chatAuthor(viewer);
		const thread = new LiveThread({
			thread: { id: '', title: chatTitle(text), createdAt: now, updatedAt: now, messageCount: 1, startedBy: author, participants: [author] },
			messages: [{ id, role: 'user', content: text, author, status: 'done', createdAt: now }, thinkingMessage(replyId(id), now)]
		}, viewer, onchange, options);
		thread.#first = { id, text };
		thread.#thinking = replyId(id);
		return thread;
	}

	/** True from `begin` until `start` has made the thread. */
	get starting(): boolean { return !this.snapshot.thread.id; }

	/**
	 * Make the thread for a chat from `begin`, and connect to it. Gives its id, or why it couldn't be
	 * made: the page then has the words to put back in the box (`text`) and nothing else to undo.
	 */
	async start(): Promise<{ id: string } | { error: string; text: string }> {
		const first = this.#first;
		if (!first) return { error: 'This chat has already started.', text: '' };
		if (!this.starting) return { id: this.snapshot.thread.id };
		const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: first.text, say: first.id }) }).catch(() => null);
		const body = (await response?.json().catch(() => null)) as { id?: unknown; error?: unknown } | null;
		if (!response?.ok || typeof body?.id !== 'string' || !CHAT_ID.test(body.id)) {
			return { error: typeof body?.error === 'string' && body.error ? body.error : response ? 'That didn’t send.' : 'That didn’t send: the site couldn’t be reached.', text: first.text };
		}
		this.snapshot.thread.id = body.id;
		this.connect();
		this.#onchange?.();
		return { id: body.id };
	}

	connect() {
		if (typeof WebSocket === 'undefined' || this.#closed || this.starting) return;
		const url = new URL(`/agents/${CHAT_AGENT}/${this.snapshot.thread.id}`, location.href);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		this.status = 'connecting';
		const socket = new WebSocket(url);
		this.#socket = socket;
		socket.onopen = () => {
			this.#retry = 0;
			this.status = 'live';
			if (this.#page) this.#send({ type: 'page:here', page: this.#page });
			else if (this.#options.ontableop) this.#send({ type: 'table:ready' });
		};
		socket.onmessage = (event) => { if (typeof event.data === 'string') this.#receive(event.data); };
		socket.onclose = () => {
			if (this.#socket !== socket || this.#closed) return;
			this.status = 'offline';
			// A background tab that isn't showing a table has nothing to do here: it comes back when Casey does.
			if (typeof document !== 'undefined' && document.hidden && !this.#page?.table) {
				this.#whenShown = () => { if (!document.hidden) { this.#forgetShown(); this.connect(); } };
				document.addEventListener('visibilitychange', this.#whenShown);
				return;
			}
			const wait = Math.min(30_000, 1000 * 2 ** this.#retry++) * (0.75 + Math.random() / 2);
			this.#timer = setTimeout(() => this.connect(), wait);
		};
	}

	#whenShown?: () => void;
	#forgetShown() {
		if (this.#whenShown) document.removeEventListener('visibilitychange', this.#whenShown);
		this.#whenShown = undefined;
	}

	close() {
		this.#closed = true;
		this.#flush();
		clearTimeout(this.#timer);
		this.#forgetShown();
		this.#socket?.close();
	}

	/**
	 * Send over the socket; false when it isn't open, so the page can fall back to the form.
	 * The message shows at once, before the thread has it. While the assistant is answering it joins
	 * that answer at its next step; with `queue` it waits and is answered after.
	 * `selection`: what Casey has selected on the open table, so the assistant knows what “these” are.
	 */
	say(text: string, selection?: ChatSelectionItem[], queue = false): boolean {
		if (this.#socket?.readyState !== WebSocket.OPEN || !this.viewer) return false;
		this.error = '';
		const id = sayId();
		this.#unsent.set(id, { text, selection, queue });
		this.snapshot.messages.push({ id, role: 'user', content: text, author: chatAuthor(this.viewer), status: 'done', createdAt: Date.now(), ...(selection?.length ? { selection: { count: selection.length, items: selection.slice(0, SELECTION_LISTED) } } : {}) });
		this.#post(id);
		this.#onchange?.();
		return true;
	}

	#post(id: string) {
		const unsent = this.#unsent.get(id);
		if (unsent) this.#send({ type: 'chat:say', id, text: unsent.text, ...(unsent.selection?.length ? { selection: unsent.selection } : {}), ...(unsent.queue ? { queue: true } : {}) });
	}

	/** Tell the thread which page this browser is on now (and its table), so the assistant knows what “this page” is. */
	here(page: ChatPage) {
		this.#page = page;
		this.#send({ type: 'page:here', page });
	}

	/** Turn groups or tools off for this chat; shown at once, and the thread answers with what it kept. */
	setOff(off: string[]) {
		if (this.choices) this.choices = { ...this.choices, off };
		this.#send({ type: 'chat:tools-off', off });
	}

	/** Answer with another model from here on; shown at once, and the thread answers with what it kept. */
	setModel(model: string) {
		if (this.models) this.models = { ...this.models, current: model };
		this.#send({ type: 'chat:model', model });
	}

	#send(event: ChatClientEvent) {
		if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(event));
	}

	async #tableOp(event: TableOpEvent) {
		const handle = this.#options.ontableop;
		if (!handle) return;
		// A tab the browser froze wakes to everything it missed at once: the change, then word that the
		// thread stopped waiting, or the socket's close. Let those arrive first, so a change nobody is
		// waiting for isn't made late (the assistant has moved on, and would make it twice).
		const socket = this.#socket;
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (this.#cancelled.delete(event.id) || socket !== this.#socket || socket?.readyState !== WebSocket.OPEN) return;
		const result = await handle(event).catch((error): TableOpResult => ({ ok: false, error: String(error?.message ?? error).slice(0, 300) }));
		this.#send({ type: 'table:result', id: event.id, ...result });
	}

	/** No answer is coming after all. */
	#dropThinking() {
		const id = this.#thinking;
		if (!id) return;
		this.#thinking = undefined;
		const message = this.#find(id);
		if (message && !message.content && !message.tools?.length) this.snapshot.messages = this.snapshot.messages.filter((one) => one !== message);
	}

	#find(id: string) { return this.snapshot.messages.find((message) => message.id === id); }

	/** Add the streamed text that's waiting to its messages. */
	#flush = () => {
		if (this.#frame) cancelAnimationFrame(this.#frame);
		this.#frame = 0;
		for (const [id, text] of this.#pending) { const message = this.#find(id); if (message) message.content += text; }
		this.#pending.clear();
	};

	#receive(data: string) {
		let event: ChatServerEvent | TableOpEvent | TableCancelEvent;
		try { event = JSON.parse(data); } catch { return; }
		// A reply arrives a few characters a message, far more often than the screen draws. Gather them
		// and update once a frame, so the page renders the reply once a frame rather than once a message.
		if (event.type === 'chat:delta') {
			this.#pending.set(event.id, (this.#pending.get(event.id) ?? '') + event.text);
			if (!this.#frame) this.#frame = typeof requestAnimationFrame === 'undefined' ? (queueMicrotask(this.#flush), -1) : requestAnimationFrame(this.#flush);
			return;
		}
		// Anything else may replace or finish a message, so it lands after the text before it.
		if (this.#pending.size) this.#flush();
		switch (event.type) {
			case 'table:op': void this.#tableOp(event); break;
			case 'table:cancel': if (typeof event.id === 'string') { this.#cancelled.add(event.id); if (this.#cancelled.size > 50) this.#cancelled.clear(); } break;
			case 'chat:navigate': if (typeof event.path === 'string' && event.path.startsWith('/') && !event.path.startsWith('//')) this.#options.onnavigate?.(event.path); break;
			case 'chat:snapshot': {
				// After a reconnect: what was shown here and never arrived stays on screen and is sent again.
				const mine = this.snapshot.messages.filter((message) => this.#unsent.has(message.id));
				for (const message of event.snapshot.messages) this.#unsent.delete(message.id);
				const waiting = mine.filter((message) => this.#unsent.has(message.id));
				// A chat just begun: the thread may not have started its answer yet. Keep showing that one is coming.
				const answered = event.snapshot.messages.some((message) => message.id === this.#thinking) || event.snapshot.messages.at(-1)?.role !== 'user';
				if (answered) this.#thinking = undefined;
				const coming = this.#thinking ? [thinkingMessage(this.#thinking)] : [];
				this.snapshot = waiting.length || coming.length ? { ...event.snapshot, messages: [...event.snapshot.messages, ...coming, ...waiting] } : event.snapshot;
				this.viewer = event.viewer ?? this.viewer;
				this.tools = event.tools;
				for (const message of waiting) this.#post(message.id);
				break;
			}
			case 'chat:message': {
				// New, or replaced whole (the server reshaped it, or it's one shown here before it was sent).
				const messages = this.snapshot.messages;
				const index = messages.findIndex((message) => message.id === event.message.id);
				this.#unsent.delete(event.message.id);
				if (event.message.id === this.#thinking) this.#thinking = undefined;
				if (index >= 0) messages[index] = event.message;
				else {
					// Above the ones still on their way, which the thread will place after it.
					const first = messages.findIndex((message) => this.#unsent.has(message.id));
					messages.splice(first < 0 ? messages.length : first, 0, event.message);
					if (event.message.role === 'user') this.#onchange?.();
				}
				break;
			}
			case 'chat:order': {
				const place = new Map(event.ids.map((id, index) => [id, index]));
				const at = (message: ChatMessage) => place.get(message.id) ?? Infinity;
				this.snapshot.messages = this.snapshot.messages.map((message, index) => ({ message, index })).sort((a, b) => (at(a.message) - at(b.message)) || a.index - b.index).map(({ message }) => message);
				break;
			}
			case 'chat:tools': { const message = this.#find(event.id); if (message) message.tools = event.tools; break; }
			case 'chat:done': { const message = this.#find(event.id); if (message) { message.status = event.status; message.content = event.content; } this.#onchange?.(); break; }
			case 'chat:title': this.snapshot.thread.title = event.title; this.#onchange?.(); break;
			case 'chat:removed': this.removed = true; this.#dropThinking(); this.close(); this.#onchange?.(); break;
			case 'chat:error': {
				this.error = event.error;
				this.#dropThinking();
				const unsent = event.id ? this.#unsent.get(event.id) : undefined;
				if (unsent) {
					this.#unsent.delete(event.id!);
					this.snapshot.messages = this.snapshot.messages.filter((message) => message.id !== event.id);
					this.#options.onreturn?.(unsent.text);
				}
				break;
			}
			case 'chat:abilities': this.tools = event.tools; break;
			case 'chat:choices': this.choices = { groups: event.groups, off: event.off }; break;
			case 'chat:models': this.models = { models: event.models, current: event.current }; break;
		}
	}
}
