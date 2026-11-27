<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { LiveThread } from '$lib/chat-client.svelte';
	import ChatLayout from './ChatLayout.svelte';
	import ChatThreadView from './ChatThreadView.svelte';
	import { conversation, owner, threads } from './fixtures';

	const { Story } = defineMeta({ title: 'Chat/ChatThreadView', component: ChatThreadView, parameters: { layout: 'fullscreen' } });

	const now = threads[0].updatedAt + 300_000;
	// Neither connects: a story shows the thread as the page first draws it.
	const going = new LiveThread({ thread: threads[0], messages: conversation }, owner);
	const begun = LiveThread.begin(owner, 'What have I written about cooperatives this year?');
</script>

<!--
	A chat, full screen: the trail with its title, the conversation, and the composer at the bottom.
	It is given a `LiveThread`, so the same view serves a chat's own page and one just started from /chat.
-->
<Story name="A chat">
	{#snippet template()}<ChatLayout {threads} currentId={threads[0].id} {now} initial="open"><ChatThreadView live={going} onplace={() => {}} /></ChatLayout>{/snippet}
</Story>

<!-- Just started from /chat: the message and the answer on its way show at once, before the chat has an address or a place in the list. -->
<Story name="Just started">
	{#snippet template()}<ChatLayout {threads} {now} initial="open"><ChatThreadView live={begun} onplace={() => {}} /></ChatLayout>{/snippet}
</Story>

<Story name="Just started, on a phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>
	{#snippet template()}<ChatLayout {threads} {now}><ChatThreadView live={begun} onplace={() => {}} /></ChatLayout>{/snippet}
</Story>
