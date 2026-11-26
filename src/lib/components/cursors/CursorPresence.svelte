<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { useShortcut } from '@ui-sdk/svelte/shortcuts';
	import PartySocket from 'partysocket';
	import { usePageCommands } from '$lib/page-commands.svelte';
	import {
		CHAT_LINGER_MS,
		CURSOR_PARTY,
		cursorColor,
		cursorRoom,
		cursorsAllowed,
		MOVE_INTERVAL_MS,
		type ClientMessage,
		type Cursor,
		type ServerMessage
	} from '$lib/cursors';
	import CursorChatField from './CursorChatField.svelte';
	import CursorLayer from './CursorLayer.svelte';
	import PresenceButton from './PresenceButton.svelte';

	/** The visitor's choice to hide live cursors, remembered for the whole site. */
	const PREFERENCE = 'cursors';
	/** The key that opens cursor chat. `/` is already site search. */
	const CHAT_KEY = 'c';

	let hidden = $state(false);
	let mounted = $state(false);
	let connected = $state(false);
	let selfId = $state('');
	let cursors = $state<Record<string, Cursor>>({});
	let width = $state(0);
	let scrollY = $state(0);
	/** Where your mouse is, in viewport pixels; unset on a touch screen or outside the window. */
	let pointer = $state<{ x: number; y: number } | null>(null);
	let chatting = $state(false);
	let draft = $state('');
	/** What you last said, kept up by your pointer until it lapses. */
	let said = $state('');

	let socket: PartySocket | null = null;
	let lastMove = 0;
	let pendingMove: ReturnType<typeof setTimeout> | undefined;
	let lapse: ReturnType<typeof setTimeout> | undefined;

	const room = $derived(cursorRoom(page.url.pathname));
	const active = $derived(mounted && !hidden && cursorsAllowed(page.url.pathname));
	const others = $derived(Object.keys(cursors).length);
	const color = $derived(selfId ? cursorColor(selfId) : 'white');

	onMount(() => {
		try {
			hidden = localStorage.getItem(PREFERENCE) === 'off';
		} catch {
			// Storage can be blocked; cursors stay on.
		}
		width = innerWidth;
		scrollY = window.scrollY;
		mounted = true;
	});

	// One connection per page: moving to another page leaves this one's room for that one's.
	$effect(() => {
		if (!active) return;
		const current = room;
		const ws = new PartySocket({ host: location.host, party: CURSOR_PARTY, room: encodeURIComponent(current) });
		socket = ws;
		ws.addEventListener('open', () => {
			connected = true;
			if (pointer) sendMove(true);
		});
		ws.addEventListener('close', () => {
			connected = false;
			cursors = {};
		});
		ws.addEventListener('message', (event) => receive(event.data));
		return () => {
			ws.close();
			if (socket === ws) socket = null;
			connected = false;
			cursors = {};
			stopChat(true);
		};
	});

	function receive(data: unknown) {
		if (typeof data !== 'string') return;
		let message: ServerMessage;
		try {
			message = JSON.parse(data);
		} catch {
			return;
		}
		if (message.type === 'sync') {
			selfId = message.self;
			cursors = message.cursors;
		} else if (message.type === 'update') {
			cursors[message.id] = message.cursor;
		} else if (message.type === 'remove') {
			delete cursors[message.id];
		}
	}

	function send(message: ClientMessage) {
		if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
	}

	/** Sends where you are, at most every `MOVE_INTERVAL_MS`, always ending on the latest spot. */
	function sendMove(now = false) {
		clearTimeout(pendingMove);
		const wait = lastMove + MOVE_INTERVAL_MS - Date.now();
		if (!now && wait > 0) {
			pendingMove = setTimeout(() => sendMove(true), wait);
			return;
		}
		if (!pointer || !width) return;
		lastMove = Date.now();
		send({ type: 'move', x: pointer.x / width, y: pointer.y + window.scrollY });
	}

	function onpointermove(event: PointerEvent) {
		// Touches aren't a cursor: phones and tablets see others but don't show themselves.
		if (event.pointerType === 'touch') return;
		pointer = { x: event.clientX, y: event.clientY };
		sendMove();
	}

	/** The pointer left the window, or the window the screen. Typing carries on where it was. */
	function leave() {
		if (!pointer || chatting) return;
		pointer = null;
		clearTimeout(pendingMove);
		send({ type: 'leave' });
	}

	function onmouseout(event: MouseEvent) {
		if (!event.relatedTarget) leave();
	}

	function onscroll() {
		scrollY = window.scrollY;
		if (pointer) sendMove();
	}

	function startChat() {
		if (!connected || !pointer) return;
		clearTimeout(lapse);
		chatting = true;
		draft = said;
		said = '';
	}

	/** Ends typing. What was said stays up a moment, unless `clear`, as Escape and leaving do. */
	function stopChat(clear = false) {
		// The field blurs as it closes; that second call mustn't take down what was just said.
		if (!chatting && !clear) return;
		const text = draft.trim();
		chatting = false;
		draft = '';
		clearTimeout(lapse);
		if (clear || !text) {
			said = '';
			send({ type: 'chat', message: '' });
			return;
		}
		said = text;
		lapse = setTimeout(() => {
			said = '';
			send({ type: 'chat', message: '' });
		}, CHAT_LINGER_MS);
	}

	function oninput() {
		send({ type: 'chat', message: draft });
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			stopChat();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			stopChat(true);
		}
	}

	function setHidden(value: boolean) {
		hidden = value;
		try {
			if (value) localStorage.setItem(PREFERENCE, 'off');
			else localStorage.removeItem(PREFERENCE);
		} catch {
			// Storage can be blocked; the choice lasts for this page.
		}
	}

	useShortcut(() => (connected && pointer && !chatting ? CHAT_KEY : null), startChat, { description: 'Chat by your cursor' });

	usePageCommands(() => {
		if (!mounted || !cursorsAllowed(page.url.pathname)) return [];
		const items = [];
		if (connected && pointer) items.push({ value: 'cursors:chat', label: 'Chat by your cursor', icon: '💬', keywords: ['cursor', 'chat', 'say', 'message', 'live'] });
		items.push(
			hidden
				? { value: 'cursors:show', label: 'Show live cursors', icon: '👀', keywords: ['cursor', 'live', 'visitors', 'presence', 'multiplayer'] }
				: { value: 'cursors:hide', label: 'Hide live cursors', icon: '🙈', keywords: ['cursor', 'live', 'visitors', 'presence', 'multiplayer'] }
		);
		return [{
			label: 'Live cursors',
			items,
			run: (value) => {
				if (value === 'cursors:chat') startChat();
				else setHidden(value === 'cursors:hide');
			}
		}];
	});
</script>

<svelte:window bind:innerWidth={width} {onscroll} {onpointermove} {onmouseout} />
<svelte:document onvisibilitychange={() => document.hidden && (stopChat(true), leave())} />

{#snippet chatField()}
	<CursorChatField bind:value={draft} autofocus {oninput} {onkeydown} onblur={() => stopChat()} />
{/snippet}

{#if active && connected}
	<CursorLayer {cursors} {width} {scrollY} self={pointer ? { ...pointer, color, message: said } : undefined} selfField={chatting ? chatField : undefined} />
	{#if others > 0}<PresenceButton {others} canChat={!!pointer} onclick={startChat} />{/if}
{/if}
