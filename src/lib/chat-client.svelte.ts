/**
 * A /chat thread in the browser: the server-rendered snapshot, kept live over the
 * thread agent's WebSocket (`/agents/chat-thread/<id>`), reconnecting with backoff.
 */
import { CHAT_AGENT, chatAuthor, SELECTION_LISTED, type ChatClientEvent, type ChatPage, type ChatMessage, type ChatSelectionItem, type ChatServerEvent, type ChatSnapshot, type ChatViewer } from '$lib/chat';
import type { TableOpEvent, TableOpResult } from '$lib/table-agent';

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

export type LiveStatus = 'connecting' | 'live' | 'offline';

export class LiveThread {
	snapshot = $state<ChatSnapshot>() as ChatSnapshot;
	viewer = $state<ChatViewer | null>(null);
	tools = $state<string[]>([]);
	status = $state<LiveStatus>('connecting');
	error = $state('');

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
	#onchange?: () => void;
	#options: LiveThreadOptions;

	/** `onchange` runs when the thread's place in a list would move: a new message, a new title, or a finished answer. */
	constructor(snapshot: ChatSnapshot, viewer: ChatViewer | null, onchange?: () => void, options: LiveThreadOptions = {}) {
		this.snapshot = snapshot;
		this.viewer = viewer;
		this.#onchange = onchange;
		this.#options = options;
	}

	get messages(): ChatMessage[] { return this.snapshot.messages; }

	connect() {
		if (typeof WebSocket === 'undefined' || this.#closed) return;
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
			const wait = Math.min(30_000, 1000 * 2 ** this.#retry++) * (0.75 + Math.random() / 2);
			this.#timer = setTimeout(() => this.connect(), wait);
		};
	}

	close() {
		this.#closed = true;
		this.#flush();
		clearTimeout(this.#timer);
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

	#send(event: ChatClientEvent) {
		if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(event));
	}

	async #tableOp(event: TableOpEvent) {
		const handle = this.#options.ontableop;
		if (!handle) return;
		const result = await handle(event).catch((error): TableOpResult => ({ ok: false, error: String(error?.message ?? error).slice(0, 300) }));
		this.#send({ type: 'table:result', id: event.id, ...result });
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
		let event: ChatServerEvent | TableOpEvent;
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
			case 'chat:navigate': if (typeof event.path === 'string' && event.path.startsWith('/') && !event.path.startsWith('//')) this.#options.onnavigate?.(event.path); break;
			case 'chat:snapshot': {
				// After a reconnect: what was shown here and never arrived stays on screen and is sent again.
				const mine = this.snapshot.messages.filter((message) => this.#unsent.has(message.id));
				for (const message of event.snapshot.messages) this.#unsent.delete(message.id);
				const waiting = mine.filter((message) => this.#unsent.has(message.id));
				this.snapshot = waiting.length ? { ...event.snapshot, messages: [...event.snapshot.messages, ...waiting] } : event.snapshot;
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
			case 'chat:error': {
				this.error = event.error;
				const unsent = event.id ? this.#unsent.get(event.id) : undefined;
				if (unsent) {
					this.#unsent.delete(event.id!);
					this.snapshot.messages = this.snapshot.messages.filter((message) => message.id !== event.id);
					this.#options.onreturn?.(unsent.text);
				}
				break;
			}
			case 'chat:abilities': this.tools = event.tools; break;
		}
	}
}
