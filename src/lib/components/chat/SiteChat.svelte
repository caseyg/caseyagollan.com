<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { chatHref, type ChatPage, type ChatSnapshot, type ChatViewer } from '$lib/chat';
	import { LiveThread } from '$lib/chat-client.svelte';
	import { siteChat } from '$lib/site-chat.svelte';
	import ChatOverlay, { type ChatOverlayMode } from './ChatOverlay.svelte';

	/**
	 * Casey's chat on every page, from the root layout. It stays mounted while the site
	 * navigates, so the conversation, the sheet and the scroll position carry over, and it tells
	 * the thread which page Casey is on so the assistant can answer about it. On a table page
	 * it also makes the table changes the assistant asks for.
	 */
	let { viewer }: { viewer: ChatViewer } = $props();

	const MODE_KEY = 'site-chat';
	const SHEET_KEY = 'site-chat-sheet';
	const THREAD_KEY = 'site-chat-thread';

	let mode = $state<ChatOverlayMode>('minimized');
	let sheetExpanded = $state(true);
	let sheetRestHeight = $state(0);
	let threadId = $state<string | null>(null);
	let live = $state<LiveThread>();
	let startError = $state<string | null>(null);
	let loaded = $state(false);

	const narrow = new MediaQuery('max-width: 899px', false);
	// /chat has its own full-page chat.
	const hidden = $derived(page.url.pathname === '/chat' || page.url.pathname.startsWith('/chat/'));
	const onTable = $derived(!!siteChat.table);

	const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
	const write = (key: string, value: string | null) => {
		try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private window */ }
	};

	onMount(() => {
		const saved = read(MODE_KEY) ?? read('table-chat');
		if (saved === 'floating' || saved === 'docked' || saved === 'minimized') mode = saved;
		sheetExpanded = (read(SHEET_KEY) ?? read('table-chat-sheet')) !== 'folded';
		threadId = read(THREAD_KEY);
		loaded = true;
	});

	$effect(() => {
		if (!loaded) return;
		write(MODE_KEY, mode);
		write(SHEET_KEY, sheetExpanded ? 'open' : 'folded');
		write(THREAD_KEY, threadId);
	});

	// No chat going yet: a table page's own thread becomes the chat.
	$effect(() => {
		if (loaded && !threadId && siteChat.table?.thread) threadId = siteChat.table.thread;
	});

	function placeholderSnapshot(id: string): ChatSnapshot {
		return { thread: { id, title: 'Chat', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0 }, messages: [] };
	}

	// One live connection per thread, kept across navigation; the socket fills in the thread.
	$effect(() => {
		const id = threadId;
		if (!id) {
			live = undefined;
			return;
		}
		const thread = new LiveThread(placeholderSnapshot(id), untrack(() => viewer), undefined, {
			onnavigate: (path) => void goto(path),
			ontableop: (event) => siteChat.table?.ontableop(event) ?? Promise.resolve({ ok: false, error: 'Casey doesn’t have a table open right now.' })
		});
		thread.here(untrack(here));
		thread.connect();
		live = thread;
		return () => thread.close();
	});

	function here(): ChatPage {
		return { path: page.url.pathname + page.url.search, title: typeof document === 'undefined' ? undefined : document.title, ...(siteChat.table ? { table: siteChat.table.table } : {}) };
	}

	// Tell the thread where Casey is after each navigation, once the new page has set its title.
	$effect(() => {
		void page.url.href;
		void siteChat.table;
		const thread = live;
		if (!thread) return;
		const frame = requestAnimationFrame(() => thread.here(here()));
		return () => cancelAnimationFrame(frame);
	});

	// Make room for a docked chat: a sidebar on wide screens, the folded sheet on narrow ones.
	const dock = $derived(!hidden && mode === 'docked' ? (narrow.current ? 'sheet' : 'side') : null);
	$effect(() => {
		const root = document.documentElement;
		if (dock) root.dataset.chatDock = dock;
		else delete root.dataset.chatDock;
		root.style.setProperty('--chat-sheet-rest', `${sheetRestHeight}px`);
		return () => { delete root.dataset.chatDock; };
	});

	async function send(text: string): Promise<boolean> {
		startError = null;
		if (live) return live.status === 'live' && live.say(text);
		const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, page: here() }) }).catch(() => null);
		const body = (await response?.json().catch(() => null)) as { id?: string; error?: string } | null;
		if (!response?.ok || !body?.id) {
			startError = body?.error ?? 'That didn’t send. Try again.';
			return false;
		}
		threadId = body.id;
		return true;
	}

	function startOver() {
		threadId = null;
		startError = null;
	}
</script>

{#if !hidden}
	<div class="site-chat" data-mode={mode} data-table={onTable || undefined}>
		<ChatOverlay
			bind:mode
			title={live?.snapshot.thread.title ?? 'New chat'}
			messages={live?.messages ?? []}
			viewer={live?.viewer ?? viewer}
			tools={live?.tools ?? []}
			onsend={send}
			returnTo={page.url.pathname}
			href={threadId ? chatHref(threadId) : undefined}
			error={live?.error || startError}
			offline={live?.status === 'offline'}
			placeholder={onTable ? 'Ask about this table' : 'Ask about this page'}
			intro={onTable ? undefined : 'Ask about this page, or anything on the site. The chat stays with you as you move around.'}
			sheet={narrow.current}
			bind:sheetExpanded
			bind:sheetRestHeight
			onnew={threadId ? startOver : undefined}
		/>
	</div>
{/if}

<style>
	/* A pill or a floating panel at bottom left, a sidebar on wide screens, or a sheet along the bottom on narrow ones. */
	.site-chat {
		position: fixed;
		z-index: var(--z-menu);
		left: var(--space-4);
		bottom: var(--space-4);
	}

	.site-chat[data-mode='floating'] {
		bottom: calc(var(--space-4) + 4rem);
	}

	@media (min-width: 900px) {
		.site-chat[data-mode='docked'] {
			inset: var(--nav-lane) 0 0 auto;
			width: 24rem;
		}
	}

	@media (max-width: 899px) {
		.site-chat[data-mode='docked'] {
			left: 0;
			right: 0;
			bottom: 0;
		}
	}

	@media (max-width: 600px) {
		.site-chat {
			left: var(--space-2);
			right: var(--space-2);
		}

		.site-chat[data-mode='minimized'] {
			right: auto;
			bottom: var(--space-2);
		}

		/* On a table the canvas toolbar owns the bottom, so the pill waits under the navigation. */
		.site-chat[data-mode='minimized'][data-table] {
			left: auto;
			right: var(--space-2);
			bottom: auto;
			top: calc(var(--nav-lane) + var(--space-2));
		}

		.site-chat[data-mode='floating'] {
			bottom: calc(3rem + 3.5rem);
		}

		.site-chat[data-mode='docked'] {
			left: 0;
			right: 0;
		}
	}
</style>
