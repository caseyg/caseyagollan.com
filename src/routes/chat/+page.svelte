<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { CHAT_CRUMB, ChatPromptInput, ChatSignIn, ChatThreadList } from '$lib/components/chat';
	import { Notice, Page, PageHeader, Section } from '$lib/components/ui';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	// svelte-ignore state_referenced_locally
	let text = $state(form?.text ?? '');
</script>

<svelte:head>
	<title>Chat - Casey Gollan</title>
	<meta name="description" content="Public chats with an AI assistant that can search Casey Gollan’s site and read the web. Anyone can read along; sign in with your website, Mastodon or Bluesky to take part." />
	<meta property="og:title" content="Chat - Casey Gollan" />
</svelte:head>

<Nav currentPage="chat" />

<Page as="main" width="reading">
	<PageHeader trail={[{ ...CHAT_CRUMB, current: true }]} title="Chat" description="Ask an assistant about anything on this site, or anything it can find on the web. Every chat is public." />

	{#if !data.available}<Notice>Chat isn’t available here.</Notice>{/if}
	{#if form?.error}<Notice tone="error">{form.error}</Notice>{/if}

	{#if data.viewer}
		<div class="start">
			<ChatPromptInput viewer={data.viewer} bind:value={text} placeholder="Start a new chat" open={!!text} disabled={!data.available} returnTo="/chat" />
		</div>
	{:else}
		<ChatSignIn returnTo="/chat" error={data.signinError} open={!!data.signinError} />
	{/if}

	<Section title="Recent chats">
		<ChatThreadList threads={data.threads} />
	</Section>
</Page>

<style>
	.start {
		margin-bottom: var(--space-5);
	}
</style>
