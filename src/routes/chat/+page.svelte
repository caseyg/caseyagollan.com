<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ActionData, PageData } from './$types';
	import { goto, pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import Nav from '$lib/components/Nav.svelte';
	import { CHAT_CRUMB, ChatModeMenu, ChatPane, ChatPromptInput, ChatSidebarToggle, ChatSignIn, ChatThreadList, ChatThreadView, type ChatPlace } from '$lib/components/chat';
	import { Button, Notice, PageHeader, Section } from '$lib/components/ui';
	import { chatHref } from '$lib/chat';
	import { LiveThread, refreshChatList } from '$lib/chat-client.svelte';
	import { leaveFullScreen, takeDraft } from '$lib/site-chat.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	// svelte-ignore state_referenced_locally
	let text = $state(form?.text || takeDraft());

	/**
	 * A chat started here opens at once, on this page: the message and the answer on its way show
	 * while its thread is made, and the address becomes the thread's when it has one. Until then the
	 * page is /chat with `chatStarting` in its history entry, so Back returns to the list.
	 */
	let live = $state<LiveThread>();
	/** What is being written in reply to it. */
	let reply = $state('');
	/** Why the last chat couldn't be started; its words are back in the box. */
	let startError = $state('');
	const there = $derived(page.state.chatStarting || !!page.state.chatThread);
	const open = $derived(live && there ? live : undefined);

	let refresh: ReturnType<typeof setTimeout> | undefined;
	/**
	 * Puts the new chat in the sidebar, and moves it there when it gets a title or an answer. Not by
	 * `invalidate`, which would clear the history entry's state and with it the chat.
	 */
	const relist = () => { clearTimeout(refresh); refresh = setTimeout(() => void refreshChatList(data.threads), 400); };

	function leave() {
		live?.close();
		live = undefined;
		reply = '';
	}
	onDestroy(() => { clearTimeout(refresh); live?.close(); });

	/** Enter in the box: the chat is on screen before anything is asked of the server. */
	function begin(value: string): boolean {
		if (!data.viewer || live) return false;
		startError = '';
		const thread = LiveThread.begin(data.viewer, value, relist, { onnavigate: (path) => void goto(path), onreturn: (returned) => { if (!reply.trim()) reply = returned; } });
		live = thread;
		pushState('', { chatStarting: true });
		void thread.start().then((result) => {
			// Casey went back to the list (or on to another page) before it was made.
			if (live !== thread) return;
			if ('id' in result) {
				if (page.state.chatStarting) replaceState(chatHref(result.id), { chatThread: result.id });
				return;
			}
			// It couldn't be made: back to the box, with the words in it to send again.
			leave();
			startError = result.error;
			if (!text.trim()) text = result.text;
		});
		return true;
	}

	const retry = () => { const value = text.trim(); if (value && begin(value)) text = ''; };

	// Back from the chat returns to the list and lets the chat go. A history entry for a chat this
	// page no longer holds (Forward after Back, or a reload) goes to the chat's own page, or back.
	let entered = false;
	$effect(() => {
		const thread = page.state.chatThread;
		if (there && live) entered = true;
		else if (!there && entered) { entered = false; leave(); }
		else if (!live && thread) void goto(chatHref(thread), { replaceState: true });
		else if (!live && page.state.chatStarting) history.back();
	});

	/** Out of full screen: back to the page Casey came from, with a new chat (or the one just started) beside or over it. */
	const place = (choice: ChatPlace) => { if (choice !== 'fullscreen') void goto(leaveFullScreen(choice, open?.snapshot.thread.id || undefined, open ? reply : text)); };
</script>

<svelte:head>
	<title>{open ? `${open.snapshot.thread.title} - ` : ''}Chat - Casey Gollan</title>
	<meta name="description" content="Chats with an AI assistant that can search Casey Gollan’s site and read the web." />
	<meta property="og:title" content="Chat - Casey Gollan" />
</svelte:head>

<Nav currentPage="chat" />

{#if open}
	<ChatThreadView live={open} bind:text={reply} onplace={place} />
{:else}
	<PageHeader trail={[{ ...CHAT_CRUMB, current: true }]} title="Chat">
		{#snippet pinned()}<ChatSidebarToggle />{#if data.viewer?.owner}<ChatModeMenu value="fullscreen" onchange={place} align="start" />{/if}{/snippet}
	</PageHeader>

	<ChatPane centered>
		{#if !data.available}<Notice>Chat isn’t available here.</Notice>{/if}
		{#if startError}
			<Notice tone="error">{startError} <Button variant="quiet" size="sm" onclick={retry} disabled={!text.trim()}>Try again</Button></Notice>
		{:else if form?.error}
			<Notice tone="error">{form.error}</Notice>
		{/if}

		{#if data.viewer}
			<!-- Without JavaScript the form posts and the server sends the browser to the new chat. -->
			<ChatPromptInput viewer={data.viewer} bind:value={text} onsend={begin} placeholder="Start a new chat" label="Start a new chat" compact disabled={!data.available} returnTo="/chat" />
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
{/if}

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
