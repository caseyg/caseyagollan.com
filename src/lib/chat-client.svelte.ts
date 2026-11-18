/**
 * A /chat thread in the browser: the server-rendered snapshot, kept live over the
 * thread agent's WebSocket (`/agents/chat-thread/<id>`), reconnecting with backoff.
 */
import { CHAT_AGENT, type ChatMessage, type ChatServerEvent, type ChatSnapshot, type ChatViewer } from '$lib/chat';

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

	constructor(snapshot: ChatSnapshot, viewer: ChatViewer | null) {
		this.snapshot = snapshot;
		this.viewer = viewer;
	}

	get messages(): ChatMessage[] { return this.snapshot.messages; }

	connect() {
		if (typeof WebSocket === 'undefined' || this.#closed) return;
		const url = new URL(`/agents/${CHAT_AGENT}/${this.snapshot.thread.id}`, location.href);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		this.status = 'connecting';
		const socket = new WebSocket(url);
		this.#socket = socket;
		socket.onopen = () => { this.#retry = 0; this.status = 'live'; };
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

	#find(id: string) { return this.snapshot.messages.find((message) => message.id === id); }

	#receive(data: string) {
		let event: ChatServerEvent;
		try { event = JSON.parse(data); } catch { return; }
		switch (event.type) {
			case 'chat:snapshot': this.snapshot = event.snapshot; this.viewer = event.viewer ?? this.viewer; this.tools = event.tools; break;
			case 'chat:message': if (!this.#find(event.message.id)) this.snapshot.messages.push(event.message); break;
			case 'chat:delta': { const message = this.#find(event.id); if (message) message.content += event.text; break; }
			case 'chat:tools': { const message = this.#find(event.id); if (message) message.tools = event.tools; break; }
			case 'chat:done': { const message = this.#find(event.id); if (message) { message.status = event.status; message.content = event.content; } break; }
			case 'chat:title': this.snapshot.thread.title = event.title; break;
			case 'chat:error': this.error = event.error; break;
		}
	}
}
