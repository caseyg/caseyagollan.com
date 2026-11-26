<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { chatAuthor, chatHref, SELECTION_LISTED, SELECTION_MAX, type ChatMessage, type ChatPage, type ChatSelectionItem, type ChatSendOptions, type ChatSnapshot, type ChatThreadSummary, type ChatViewer } from '$lib/chat';
	import { LiveThread } from '$lib/chat-client.svelte';
	import { siteChat, type ChatPlacement } from '$lib/site-chat.svelte';
	import type { ChatPlace } from './ChatModeMenu.svelte';
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
	const PLACEMENT_KEY = 'site-chat-placement';

	let mode = $state<ChatOverlayMode>('minimized');
	/** Open on a wide screen: down the side of the page, or a window over its corner. */
	let placement = $state<ChatPlacement>('sidebar');
	let sheetExpanded = $state(true);
	let sheetRestHeight = $state(0);
	let threadId = $state<string | null>(null);
	let live = $state<LiveThread>();
	let startError = $state<string | null>(null);
	/** What's written in the composer. */
	let draft = $state('');
	/** The first message of a chat that's being started, shown while its thread is made. */
	let starting = $state<ChatMessage | null>(null);
	let loaded = $state(false);
	let threads = $state<ChatThreadSummary[] | null>(null);

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
		// Open was once floating or docked; both are docked now.
		if (saved === 'floating' || saved === 'docked') mode = 'docked';
		if (read(PLACEMENT_KEY) === 'floating') placement = 'floating';
		sheetExpanded = (read(SHEET_KEY) ?? read('table-chat-sheet')) !== 'folded';
		threadId = read(THREAD_KEY);
		loaded = true;
	});

	$effect(() => {
		if (!loaded) return;
		write(MODE_KEY, mode);
		write(PLACEMENT_KEY, placement);
		write(SHEET_KEY, sheetExpanded ? 'open' : 'folded');
		write(THREAD_KEY, threadId);
	});

	// No chat going yet: a table page's own thread becomes the chat.
	$effect(() => {
		if (loaded && !threadId && siteChat.table?.thread) threadId = siteChat.table.thread;
	});

	function placeholderSnapshot(id: string, first: ChatMessage | null): ChatSnapshot {
		return { thread: { id, title: 'Chat', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0 }, messages: first ? [first] : [] };
	}

	/** A message that was shown and then refused goes back in the box, unless something newer is being written. */
	const giveBack = (text: string) => { if (!draft.trim()) draft = text; };

	// One live connection per thread, kept across navigation; the socket fills in the thread.
	$effect(() => {
		const id = threadId;
		if (!id) {
			live = undefined;
			return;
		}
		// A chat just started keeps showing its first message until the thread sends it back.
		const thread = new LiveThread(placeholderSnapshot(id, untrack(() => starting)), untrack(() => viewer), undefined, {
			onnavigate: (path) => void goto(path),
			onreturn: giveBack,
			ontableop: (event) => siteChat.table?.ontableop(event) ?? Promise.resolve({ ok: false, error: 'Casey doesn’t have a table open right now.' })
		});
		thread.here(untrack(here));
		thread.connect();
		live = thread;
		starting = null;
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

	// Make room for a docked chat: a sidebar on wide screens, the folded sheet on narrow ones. A floating window needs none.
	const dock = $derived(!hidden && mode === 'docked' ? (narrow.current ? 'sheet' : placement === 'sidebar' ? 'side' : null) : null);

	// Where to go back to when a /chat page leaves full screen.
	$effect(() => {
		if (!hidden) siteChat.lastPage = page.url.pathname + page.url.search;
	});

	// A /chat page left full screen: its chat opens here, where it was asked to sit.
	$effect(() => {
		const asked = siteChat.dock;
		if (!loaded || !asked) return;
		siteChat.dock = null;
		placement = asked.placement;
		mode = 'docked';
		if (asked.draft) draft = asked.draft;
		if (asked.thread && asked.thread !== untrack(() => threadId)) pick(asked.thread);
		else if (!asked.thread) startOver();
	});

	/** The title bar's Sidebar, Floating or Full screen. Full screen is the chat's own page. */
	function place(choice: ChatPlace) {
		if (choice !== 'fullscreen') {
			placement = choice;
			return;
		}
		siteChat.draft = draft;
		draft = '';
		void goto(threadId ? chatHref(threadId) : '/chat');
	}
	// Both live on <html>, so every change restyles the whole page: set each only when it changes.
	$effect(() => {
		const root = document.documentElement;
		if (dock) root.dataset.chatDock = dock;
		else delete root.dataset.chatDock;
		return () => { delete root.dataset.chatDock; };
	});
	$effect(() => {
		document.documentElement.style.setProperty('--chat-sheet-rest', `${sheetRestHeight}px`);
	});

	function send(text: string, { queue }: ChatSendOptions): boolean {
		startError = null;
		// What's selected on the table goes with the message: the assistant acts on just that when asked about “these”.
		const selection = siteChat.table?.selection?.slice(0, SELECTION_MAX);
		if (live) return live.status === 'live' && live.say(text, selection, queue);
		if (starting) return false;
		starting = { id: 'starting', role: 'user', content: text, author: chatAuthor(viewer), status: 'done', createdAt: Date.now(), ...(selection?.length ? { selection: { count: selection.length, items: selection.slice(0, SELECTION_LISTED) } } : {}) };
		void start(text, selection);
		return true;
	}

	/** Make the thread for a first message that's already on screen. */
	async function start(text: string, selection?: ChatSelectionItem[]) {
		const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, page: here(), ...(selection?.length ? { selection } : {}) }) }).catch(() => null);
		const body = (await response?.json().catch(() => null)) as { id?: string; error?: string } | null;
		if (!response?.ok || !body?.id) {
			startError = body?.error ?? 'That didn’t send. Try again.';
			starting = null;
			giveBack(text);
			return;
		}
		threadId = body.id;
	}

	async function listThreads() {
		const response = await fetch('/api/chat?threads', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
		const body = (await response?.json().catch(() => null)) as { threads?: ChatThreadSummary[] } | null;
		threads = body?.threads ?? [];
	}

	function pick(id: string) {
		starting = null;
		threadId = id;
		startError = null;
	}

	function startOver() {
		threadId = null;
		startError = null;
	}
</script>

{#if !hidden}
	<div class="site-chat" data-mode={mode}>
		<ChatOverlay
			bind:mode
			title={live?.snapshot.thread.title ?? 'New chat'}
			messages={live?.messages ?? (starting ? [starting] : [])}
			viewer={live?.viewer ?? viewer}
			tools={live?.tools ?? []}
			onsend={send}
			bind:text={draft}
			returnTo={page.url.pathname}
			href={threadId ? chatHref(threadId) : undefined}
			error={live?.error || startError}
			offline={live?.status === 'offline'}
			launcher={onTable ? 'top-right' : 'bottom-right'}
			sheet={narrow.current}
			bind:sheetExpanded
			bind:sheetRestHeight
			onnew={threadId ? startOver : undefined}
			{threads}
			onlistthreads={listThreads}
			onpick={pick}
			current={threadId ?? undefined}
			selection={siteChat.table?.selection ?? []}
			ondeselect={() => siteChat.table?.deselect?.()}
			{placement}
			onplace={place}
		/>
	</div>
{/if}

<style>
	/*
	 * Folded, a round button floating at bottom right (on a table the canvas toolbar and tldraw's
	 * watermark own the bottom, so it waits under the navigation). Open, the site's side panel on
	 * wide screens. Both place themselves; only the narrow screens' sheet needs putting along the bottom.
	 */
	@media (max-width: 899px) {
		.site-chat[data-mode='docked'] {
			position: fixed;
			z-index: var(--z-menu);
			left: 0;
			right: 0;
			bottom: 0;
		}
	}
</style>
