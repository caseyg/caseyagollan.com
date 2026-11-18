/**
 * A /chat thread in the browser: the server-rendered snapshot, kept live over the
 * thread agent's WebSocket (`/agents/chat-thread/<id>`), reconnecting with backoff.
 */
import { CHAT_AGENT, type ChatClientEvent, type ChatMessage, type ChatServerEvent, type ChatSnapshot, type ChatViewer } from '$lib/chat';
import type { TableOpEvent, TableOpResult } from '$lib/table-agent';

export interface LiveThreadOptions {
	/** The assistant is taking this person to a page of the site. */
	onnavigate?: (path: string) => void;
	/** On Casey's table page: make a change the assistant asked for, and say how it went. */
	ontableop?: (event: TableOpEvent) => Promise<TableOpResult>;
}

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
			if (this.#options.ontableop) this.#send({ type: 'table:ready' });
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
		clearTimeout(this.#timer);
		this.#socket?.close();
	}

	/** Send over the socket; false when it isn't open, so the page can fall back to the form. */
	say(text: string): boolean {
		if (this.#socket?.readyState !== WebSocket.OPEN) return false;
		this.error = '';
		this.#socket.send(JSON.stringify({ type: 'chat:say', text }));
		return true;
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

	#receive(data: string) {
		let event: ChatServerEvent | TableOpEvent;
		try { event = JSON.parse(data); } catch { return; }
		switch (event.type) {
			case 'table:op': void this.#tableOp(event); break;
			case 'chat:navigate': if (typeof event.path === 'string' && event.path.startsWith('/') && !event.path.startsWith('//')) this.#options.onnavigate?.(event.path); break;
			case 'chat:snapshot': this.snapshot = event.snapshot; this.viewer = event.viewer ?? this.viewer; this.tools = event.tools; break;
			case 'chat:message': {
				// New, or replaced whole (the server reshaped it).
				const index = this.snapshot.messages.findIndex((message) => message.id === event.message.id);
				if (index >= 0) this.snapshot.messages[index] = event.message;
				else { this.snapshot.messages.push(event.message); if (event.message.role === 'user') this.#onchange?.(); }
				break;
			}
			case 'chat:delta': { const message = this.#find(event.id); if (message) message.content += event.text; break; }
			case 'chat:tools': { const message = this.#find(event.id); if (message) message.tools = event.tools; break; }
			case 'chat:done': { const message = this.#find(event.id); if (message) { message.status = event.status; message.content = event.content; } this.#onchange?.(); break; }
			case 'chat:title': this.snapshot.thread.title = event.title; this.#onchange?.(); break;
			case 'chat:error': this.error = event.error; break;
		}
	}
}
