<script lang="ts">
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { CHAT_CRUMB, ChatConversation, ChatPromptInput, ChatSidebarToggle, ChatSignIn } from '$lib/components/chat';
	import { goto, invalidate } from '$app/navigation';
	import { Notice, Page, PageHeader } from '$lib/components/ui';
	import { LiveThread } from '$lib/chat-client.svelte';
	import { chatHref } from '$lib/chat';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let refresh: ReturnType<typeof setTimeout> | undefined;
	/** Moves this thread in the sidebar when it gets a message, a title or an answer. */
	const relist = () => { clearTimeout(refresh); refresh = setTimeout(() => invalidate('chat:threads'), 400); };
	// svelte-ignore state_referenced_locally
	// The assistant's go_to sends the person who asked to another page of the site.
	const live = new LiveThread(data.snapshot, data.viewer, relist, { onnavigate: (path) => void goto(path) });
	const viewer = $derived(live.viewer);
	const thread = $derived(live.snapshot.thread);
	const href = $derived(chatHref(thread.id));
	let text = $state('');

	onMount(() => {
		live.connect();
		return () => { clearTimeout(refresh); live.close(); };
	});

	/** Over the socket when it's open; otherwise the form posts. */
	const send = (value: string) => live.say(value);
</script>

<svelte:head>
	<title>{thread.title} - Chat - Casey Gollan</title>
	<meta name="description" content="A public chat on caseyagollan.com: {thread.title}" />
	<meta property="og:title" content="{thread.title} - Chat" />
</svelte:head>

<Nav currentPage="chat" />

<Page as="main" width="reading" class="chat-page">
	<PageHeader trail={[CHAT_CRUMB, { label: thread.title, href, current: true }]} title={thread.title}>
		{#snippet pinned()}<ChatSidebarToggle />{/snippet}
	</PageHeader>

	<ChatConversation messages={live.messages} viewerId={viewer?.id} />

	<div class="composer">
		{#if live.error || form?.error}<Notice tone="error">{live.error || form?.error}</Notice>{/if}
		{#if live.status === 'offline'}<Notice>Reconnecting… new messages will show up when it’s back.</Notice>{/if}
		{#if viewer}
			<ChatPromptInput {viewer} bind:value={text} onsend={live.status === 'live' ? send : undefined} returnTo={href} tools={live.tools} label="Reply" compact />
		{:else}
			<ChatSignIn returnTo={href} error={data.signinError} open={!!data.signinError} />
		{/if}
	</div>
</Page>

<style>
	/* The composer stays at the bottom of the window while the thread scrolls. */
	.composer {
		position: sticky;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-4);
		padding: var(--space-3) 0 var(--space-4);
		background: linear-gradient(to bottom, transparent, var(--bg-primary) var(--space-3));
	}
</style>
