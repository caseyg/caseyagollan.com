<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatConversation from './ChatConversation.svelte';
	import ChatPane from './ChatPane.svelte';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import { conversation, owner } from './fixtures';

	const { Story } = defineMeta({ title: 'Chat/ChatPane', component: ChatPane, parameters: { layout: 'fullscreen' } });

	const long = [...conversation.slice(0, 3), ...conversation.slice(0, 3).map((message) => ({ ...message, id: `${message.id}-again` })), ...conversation];
</script>

<!-- A full-page chat's body: a centred column that scrolls by itself, the composer held at the bottom. It fills the height it is given. -->
<Story name="A conversation">
	{#snippet template()}
		<div class="frame">
			<ChatPane as="div">
				<ChatConversation messages={long} viewerId={owner.id} />
				{#snippet footer()}<ChatPromptInput viewer={owner} onsend={() => true} label="Reply" compact />{/snippet}
			</ChatPane>
		</div>
	{/snippet}
</Story>

<!-- Starting a chat: everything sits in the middle. -->
<Story name="Centered">
	{#snippet template()}
		<div class="frame">
			<ChatPane as="div" centered><ChatPromptInput viewer={owner} onsend={() => true} placeholder="Start a new chat" compact /></ChatPane>
		</div>
	{/snippet}
</Story>

<Story name="On a phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>
	{#snippet template()}
		<div class="frame">
			<ChatPane as="div">
				<ChatConversation messages={long} viewerId={owner.id} />
				{#snippet footer()}<ChatPromptInput viewer={owner} onsend={() => true} label="Reply" compact />{/snippet}
			</ChatPane>
		</div>
	{/snippet}
</Story>

<style>
	.frame {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
</style>
