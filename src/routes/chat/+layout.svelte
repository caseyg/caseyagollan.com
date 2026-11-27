<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { LayoutData } from './$types';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { chatActions, ChatLayout, ChatManage, type ChatChange } from '$lib/components/chat';
	import { chatList, refreshChatList } from '$lib/chat-client.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ARCHIVED = '/chat/archived';

	/** Chats just archived or deleted here: out of the list at once, before it is read again. */
	const gone = new SvelteSet<string>();
	// A page that couldn't reload this list read it again itself (see `refreshChatList`).
	const threads = $derived((chatList.fresh?.over === data.threads ? chatList.fresh.threads : data.threads).filter((thread) => !gone.has(thread.id)));
	// A chat just started from /chat is open on that page before it has a page of its own (`chatThread`).
	const currentId = $derived(page.params.id ?? page.state.chatThread);
	const onArchive = $derived(page.url.pathname.replace(/\/$/, '') === ARCHIVED);

	function changed({ id, kind }: ChatChange) {
		if (kind === 'unarchived') gone.delete(id);
		else gone.add(id);
		// The chat being read is no more: on to a new one, with the lists read again on the way.
		if (kind === 'deleted' && id === currentId) return void goto('/chat', { replaceState: true, invalidateAll: true });
		// Reloading the list would close a chat /chat has just started (it clears the history entry's state), so that page's list is read again by hand.
		if (page.state.chatStarting || page.state.chatThread) void refreshChatList(data.threads);
		else void invalidate('chat:threads');
		if (onArchive) void invalidate('chat:archived');
	}

	// Only Casey archives and deletes chats.
	const owner = $derived(!!page.data.viewer?.owner);
	const manage = $derived(owner ? new ChatManage(chatActions, changed) : undefined);
</script>

{#key manage}
	<ChatLayout {threads} {currentId} searchable={owner} {manage} archivedHref={ARCHIVED} archivedCurrent={onArchive}>
		<!-- A thread page holds one live connection, so moving to another thread makes a fresh page. -->
		{#key page.params.id}{@render children()}{/key}
	</ChatLayout>
{/key}
