<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatSidebar from './ChatSidebar.svelte';
	import { threads } from './fixtures';

	const { Story } = defineMeta({
		title: 'Chat/ChatSidebar',
		component: ChatSidebar,
		args: { threads, currentId: threads[0].id, now: threads[0].updatedAt + 300_000, onsearch: () => {} }
	});
</script>

<!-- New chat and Search on top (Search opens ⌘K), then the chats under the day they last moved; the open one is marked in gray. -->
<Story name="Threads">
	{#snippet template(args)}<div style="width: 17rem; height: 28rem;"><ChatSidebar {...args} /></div>{/snippet}
</Story>

<!-- For someone who can't search chats: no Search row. -->
<Story name="Without search" args={{ onsearch: undefined }}>
	{#snippet template(args)}<div style="width: 17rem; height: 28rem;"><ChatSidebar {...args} /></div>{/snippet}
</Story>

<Story name="Empty" args={{ threads: [] }}>
	{#snippet template(args)}<div style="width: 17rem; height: 12rem;"><ChatSidebar {...args} /></div>{/snippet}
</Story>
