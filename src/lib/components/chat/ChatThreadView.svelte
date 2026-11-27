<script lang="ts">
	import { chatHref, type ChatSendOptions } from '$lib/chat';
	import type { LiveThread } from '$lib/chat-client.svelte';
	import { Notice, PageHeader } from '$lib/components/ui';
	import ChatConversation from './ChatConversation.svelte';
	import ChatModeMenu, { type ChatPlace } from './ChatModeMenu.svelte';
	import ChatPane from './ChatPane.svelte';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import ChatSidebarToggle from './ChatSidebarToggle.svelte';
	import ChatSignIn from './ChatSignIn.svelte';
	import { CHAT_CRUMB } from './crumb';

	interface Props {
		/** The thread, live; or one just begun (`LiveThread.begin`), shown while it is made. */
		live: LiveThread;
		/** What is being written in reply. */
		text?: string;
		/** Something to say above the composer, such as why a posted form was refused. */
		error?: string;
		signinError?: string | null;
		/** The page has a form action that takes a reply, for when the connection isn't open (and without JavaScript). */
		posts?: boolean;
		/** Casey chose Sidebar or Floating: the chat leaves full screen. */
		onplace?: (choice: ChatPlace) => void;
	}

	let { live, text = $bindable(''), error = '', signinError = null, posts = false, onplace }: Props = $props();

	const viewer = $derived(live.viewer);
	const thread = $derived(live.snapshot.thread);
	// A chat that is still being made has no address yet.
	const href = $derived(thread.id ? chatHref(thread.id) : undefined);

	const send = (value: string, { queue }: ChatSendOptions) => live.say(value, undefined, queue);
</script>

<!-- A chat, full screen: its title in the trail, the conversation scrolling by itself, and the composer held at the bottom. -->
<PageHeader trail={[CHAT_CRUMB, { label: thread.title, href, current: true }]} title={thread.title}>
	{#snippet pinned()}<ChatSidebarToggle />{#if viewer?.owner && onplace}<ChatModeMenu value="fullscreen" onchange={onplace} align="start" />{/if}{/snippet}
</PageHeader>

<ChatPane>
	<ChatConversation messages={live.messages} viewerId={viewer?.id} />
	{#snippet footer()}
		{#if live.error || error}<Notice tone="error">{live.error || error}</Notice>{/if}
		{#if live.status === 'offline'}<Notice>Reconnecting… new messages will show up when it’s back.</Notice>{/if}
		{#if viewer}
			<!-- Over the socket when it's open; otherwise the form posts, where the page takes one. -->
			<ChatPromptInput {viewer} bind:value={text} onsend={posts && live.status !== 'live' ? undefined : send} returnTo={href ?? CHAT_CRUMB.href} tools={live.tools} choices={live.choices} onchoices={(off) => live.setOff(off)} label="Reply" compact />
		{:else}
			<ChatSignIn returnTo={href ?? CHAT_CRUMB.href} error={signinError} open={!!signinError} />
		{/if}
	{/snippet}
</ChatPane>
