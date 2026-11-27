<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatArchive from './ChatArchive.svelte';
	import { threads } from './fixtures';

	const archived = threads.slice(0, 3).map((thread) => ({ ...thread, archivedAt: thread.updatedAt + 240_000 }));
	const { Story } = defineMeta({
		title: 'Chat/ChatArchive',
		component: ChatArchive,
		args: { threads: archived, now: threads[0].updatedAt + 300_000, onunarchive: () => {}, ondelete: () => {} }
	});
</script>

<!-- The chats Casey has archived, on /chat/archived: each still opens, and can go back to the list or be deleted. -->
<Story name="Archived">
	{#snippet template(args)}<div style="max-width: 40rem;"><ChatArchive {...args} /></div>{/snippet}
</Story>

<Story name="Nothing archived" args={{ threads: [] }} />

<Story name="Action failed" args={{ error: 'That didn’t work. Try again.' }} />
