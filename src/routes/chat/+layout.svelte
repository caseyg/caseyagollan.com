<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import { ChatLayout } from '$lib/components/chat';
	import { chatList } from '$lib/chat-client.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// A page that couldn't reload this list read it again itself (see `refreshChatList`).
	const threads = $derived(chatList.fresh?.over === data.threads ? chatList.fresh.threads : data.threads);
</script>

<!-- A chat just started from /chat is open on that page before it has a page of its own (`chatThread`). -->
<ChatLayout {threads} currentId={page.params.id ?? page.state.chatThread} searchable={!!page.data.viewer?.owner}>
	<!-- A thread page holds one live connection, so moving to another thread makes a fresh page. -->
	{#key page.params.id}{@render children()}{/key}
</ChatLayout>
