<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatSidebar from './ChatSidebar.svelte';
	import { threads } from './fixtures';

	const { Story } = defineMeta({
		title: 'Chat/ChatSidebar',
		component: ChatSidebar,
		args: { threads, currentId: threads[0].id, now: threads[0].updatedAt + 300_000, onclose: () => {} }
	});
</script>

<Story name="Threads">
	{#snippet template(args)}<div style="width: 16rem; height: 24rem;"><ChatSidebar {...args} /></div>{/snippet}
</Story>

<Story name="Empty" args={{ threads: [] }}>
	{#snippet template(args)}<div style="width: 16rem; height: 12rem;"><ChatSidebar {...args} /></div>{/snippet}
</Story>
