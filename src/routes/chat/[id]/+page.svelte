<script lang="ts">
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { CHAT_CRUMB, ChatConversation, ChatModeMenu, ChatPane, ChatPromptInput, ChatSidebarToggle, ChatSignIn, type ChatPlace } from '$lib/components/chat';
	import { goto, invalidate } from '$app/navigation';
	import { Notice, PageHeader } from '$lib/components/ui';
	import { LiveThread } from '$lib/chat-client.svelte';
	import { chatHref, type ChatSendOptions } from '$lib/chat';
	import { leaveFullScreen, takeDraft } from '$lib/site-chat.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let refresh: ReturnType<typeof setTimeout> | undefined;
	/** Moves this thread in the sidebar when it gets a message, a title or an answer. */
	const relist = () => { clearTimeout(refresh); refresh = setTimeout(() => invalidate('chat:threads'), 400); };
	// svelte-ignore state_referenced_locally
	// The assistant's go_to sends the person who asked to another page of the site.
	const live = new LiveThread(data.snapshot, data.viewer, relist, { onnavigate: (path) => void goto(path), onreturn: (value) => { if (!text.trim()) text = value; } });
	const viewer = $derived(live.viewer);
	const thread = $derived(live.snapshot.thread);
	const href = $derived(chatHref(thread.id));
	// What was being written when the chat was made full screen comes along.
	let text = $state(takeDraft());

	onMount(() => {
		live.connect();
		return () => { clearTimeout(refresh); live.close(); };
	});

	/** Over the socket when it's open; otherwise the form posts. */
	const send = (value: string, { queue }: ChatSendOptions) => live.say(value, undefined, queue);

	/** Out of full screen: back to the page Casey came from, with this chat beside or over it. */
	const place = (choice: ChatPlace) => { if (choice !== 'fullscreen') void goto(leaveFullScreen(choice, thread.id, text)); };
</script>

<svelte:head>
	<title>{thread.title} - Chat - Casey Gollan</title>
	<meta name="description" content="A chat on caseyagollan.com: {thread.title}" />
	<meta property="og:title" content="{thread.title} - Chat" />
</svelte:head>

<Nav currentPage="chat" />

<PageHeader trail={[CHAT_CRUMB, { label: thread.title, href, current: true }]} title={thread.title}>
	{#snippet pinned()}<ChatSidebarToggle />{#if viewer?.owner}<ChatModeMenu value="fullscreen" onchange={place} align="start" />{/if}{/snippet}
</PageHeader>

<ChatPane>
	<ChatConversation messages={live.messages} viewerId={viewer?.id} />
	{#snippet footer()}
		{#if live.error || form?.error}<Notice tone="error">{live.error || form?.error}</Notice>{/if}
		{#if live.status === 'offline'}<Notice>Reconnecting… new messages will show up when it’s back.</Notice>{/if}
		{#if viewer}
			<ChatPromptInput {viewer} bind:value={text} onsend={live.status === 'live' ? send : undefined} returnTo={href} tools={live.tools} label="Reply" compact />
		{:else}
			<ChatSignIn returnTo={href} error={data.signinError} open={!!data.signinError} />
		{/if}
	{/snippet}
</ChatPane>
