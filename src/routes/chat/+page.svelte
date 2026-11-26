<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { goto } from '$app/navigation';
	import Nav from '$lib/components/Nav.svelte';
	import { CHAT_CRUMB, ChatModeMenu, ChatPane, ChatPromptInput, ChatSidebarToggle, ChatSignIn, ChatThreadList, type ChatPlace } from '$lib/components/chat';
	import { Notice, PageHeader, Section } from '$lib/components/ui';
	import { leaveFullScreen, takeDraft } from '$lib/site-chat.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	// svelte-ignore state_referenced_locally
	let text = $state(form?.text || takeDraft());

	/** Out of full screen: back to the page Casey came from, with a new chat beside or over it. */
	const place = (choice: ChatPlace) => { if (choice !== 'fullscreen') void goto(leaveFullScreen(choice, undefined, text)); };
</script>

<svelte:head>
	<title>Chat - Casey Gollan</title>
	<meta name="description" content="Chats with an AI assistant that can search Casey Gollan’s site and read the web." />
	<meta property="og:title" content="Chat - Casey Gollan" />
</svelte:head>

<Nav currentPage="chat" />

<PageHeader trail={[{ ...CHAT_CRUMB, current: true }]} title="Chat">
	{#snippet pinned()}<ChatSidebarToggle />{#if data.viewer?.owner}<ChatModeMenu value="fullscreen" onchange={place} align="start" />{/if}{/snippet}
</PageHeader>

<ChatPane centered>
	{#if !data.available}<Notice>Chat isn’t available here.</Notice>{/if}
	{#if form?.error}<Notice tone="error">{form.error}</Notice>{/if}

	{#if data.viewer}
		<ChatPromptInput viewer={data.viewer} bind:value={text} placeholder="Start a new chat" label="Start a new chat" compact disabled={!data.available} returnTo="/chat" />
	{:else}
		<ChatSignIn returnTo="/chat" error={data.signinError} open={!!data.signinError} />
	{/if}

	<!-- The sidebar lists chats beside the page; narrow screens (and no JavaScript) get the list here too. -->
	<div class="narrow-list">
		<Section title="Recent chats">
			<ChatThreadList threads={data.threads} />
		</Section>
	</div>
</ChatPane>

<style>
	.narrow-list {
		margin-top: var(--space-6);
	}

	@media (min-width: 900px) {
		.narrow-list {
			display: none;
		}
	}
</style>
