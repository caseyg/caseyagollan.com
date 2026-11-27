<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { CHAT_CRUMB, ChatArchive, ChatPane, ChatSidebarToggle, useChatManage } from '$lib/components/chat';
	import { PageHeader } from '$lib/components/ui';

	let { data }: { data: PageData } = $props();

	// The layout reads this list again after each change (`chat:archived`).
	const manage = useChatManage();
</script>

<svelte:head>
	<title>Archived - Chat - Casey Gollan</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<Nav currentPage="chat" />

<PageHeader trail={[CHAT_CRUMB, { label: 'Archived', href: '/chat/archived', current: true }]} title="Archived chats">
	{#snippet pinned()}<ChatSidebarToggle />{/snippet}
</PageHeader>

<ChatPane>
	<ChatArchive threads={data.archived} error={manage?.error} onunarchive={(chat) => void manage?.archive(chat, false)} ondelete={(chat) => void manage?.remove(chat)} />
</ChatPane>
