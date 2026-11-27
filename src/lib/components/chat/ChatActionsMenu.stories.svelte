<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatActionsMenu from './ChatActionsMenu.svelte';
	import { threads } from './fixtures';

	const { Story } = defineMeta({
		title: 'Chat/ChatActionsMenu',
		component: ChatActionsMenu,
		parameters: { docs: { story: { height: '220px' } } },
		args: { chat: threads[0], onarchive: () => {}, ondelete: () => {} }
	});
</script>

<!-- A chat's ⋯ button, in the list of chats and in an open chat's trail: Archive, and Delete after the separator. -->
<Story name="Chat" />

<!-- An archived chat offers the way back instead. -->
<Story name="Archived chat" args={{ chat: { ...threads[0], archivedAt: threads[0].updatedAt + 60_000 } }} />
