<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatConversation from './ChatConversation.svelte';
	import { answer, conversation, draft, failed, question, visitor } from './fixtures';

	const { Story } = defineMeta({ title: 'Chat/ChatConversation', component: ChatConversation, args: { messages: conversation, viewerId: visitor.id } });
</script>

<!-- Several people and the assistant; the last reply is still streaming. -->
<Story name="Thread" />

<Story name="Owner turn" args={{ messages: [{ ...question, author: { ...question.author!, via: 'owner', name: 'Casey Gollan' } }, draft] }} />

<Story name="Answer failed" args={{ messages: [question, answer, failed] }} />

<Story name="Empty" args={{ messages: [] }}>
	{#snippet template(args)}
		<ChatConversation {...args}>
			{#snippet empty()}<p>No messages yet.</p>{/snippet}
		</ChatConversation>
	{/snippet}
</Story>
