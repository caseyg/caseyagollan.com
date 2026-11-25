<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatLayout from './ChatLayout.svelte';
	import ChatConversation from './ChatConversation.svelte';
	import ChatSidebarToggle from './ChatSidebarToggle.svelte';
	import { CHAT_CRUMB } from './index';
	import { Page, PageHeader } from '$lib/components/ui';
	import { conversation, threads } from './fixtures';

	const { Story } = defineMeta({
		title: 'Chat/ChatLayout',
		component: ChatLayout,
		parameters: { layout: 'fullscreen' },
		args: { threads, currentId: threads[0].id, now: threads[0].updatedAt + 300_000 }
	});
</script>

{#snippet thread()}
	<Page as="main" width="reading">
		<PageHeader trail={[CHAT_CRUMB, { label: threads[0].title, href: '/chat/a1b2c3d4e5', current: true }]} title={threads[0].title}>
			{#snippet pinned()}<ChatSidebarToggle />{/snippet}
		</PageHeader>
		<ChatConversation messages={conversation} />
	</Page>
{/snippet}

<Story name="Open">
	{#snippet template(args)}<ChatLayout threads={args.threads ?? threads} currentId={args.currentId} now={args.now} initial="open">{@render thread()}</ChatLayout>{/snippet}
</Story>

<Story name="Closed">
	{#snippet template(args)}<ChatLayout threads={args.threads ?? threads} currentId={args.currentId} now={args.now} initial="closed">{@render thread()}</ChatLayout>{/snippet}
</Story>

<Story name="By screen width">
	{#snippet template(args)}<ChatLayout threads={args.threads ?? threads} currentId={args.currentId} now={args.now}>{@render thread()}</ChatLayout>{/snippet}
</Story>
