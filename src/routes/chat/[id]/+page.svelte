<script lang="ts">
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { ChatThreadView, type ChatPlace } from '$lib/components/chat';
	import { goto, invalidate } from '$app/navigation';
	import { LiveThread } from '$lib/chat-client.svelte';
	import { leaveFullScreen, takeDraft } from '$lib/site-chat.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let refresh: ReturnType<typeof setTimeout> | undefined;
	/** Moves this thread in the sidebar when it gets a message, a title or an answer. */
	const relist = () => { clearTimeout(refresh); refresh = setTimeout(() => invalidate('chat:threads'), 400); };
	// svelte-ignore state_referenced_locally
	// The assistant's go_to sends the person who asked to another page of the site.
	const live = new LiveThread(data.snapshot, data.viewer, relist, { onnavigate: (path) => void goto(path), onreturn: (value) => { if (!text.trim()) text = value; } });
	const thread = $derived(live.snapshot.thread);
	// What was being written when the chat was made full screen comes along.
	let text = $state(takeDraft());

	onMount(() => {
		live.connect();
		return () => { clearTimeout(refresh); live.close(); };
	});

	/** Out of full screen: back to the page Casey came from, with this chat beside or over it. */
	const place = (choice: ChatPlace) => { if (choice !== 'fullscreen') void goto(leaveFullScreen(choice, thread.id, text)); };
</script>

<svelte:head>
	<title>{thread.title} - Chat - Casey Gollan</title>
	<meta name="description" content="A chat on caseyagollan.com: {thread.title}" />
	<meta property="og:title" content="{thread.title} - Chat" />
</svelte:head>

<Nav currentPage="chat" />

<ChatThreadView {live} bind:text error={form?.error} signinError={data.signinError} posts onplace={place} />
