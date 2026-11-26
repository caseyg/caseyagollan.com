<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatLayout from './ChatLayout.svelte';
	import ChatConversation from './ChatConversation.svelte';
	import ChatModeMenu from './ChatModeMenu.svelte';
	import ChatPane from './ChatPane.svelte';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import ChatSidebarToggle from './ChatSidebarToggle.svelte';
	import { CHAT_CRUMB } from './index';
	import { PageHeader } from '$lib/components/ui';
	import { conversation, owner, threads } from './fixtures';

	const { Story } = defineMeta({
		title: 'Chat/ChatLayout',
		component: ChatLayout,
		parameters: { layout: 'fullscreen' },
		args: { threads, currentId: threads[0].id, now: threads[0].updatedAt + 300_000, searchable: true }
	});

	const long = [...conversation.slice(0, 3), ...conversation.slice(0, 3).map((message) => ({ ...message, id: `${message.id}-again` })), ...conversation];
</script>

<!--
	The full-page chat: the list of chats down the left under the pinned trail, and the chat in a
	centred column that scrolls by itself, with the composer held at the bottom. The trail carries
	the list's toggle and the Sidebar / Floating / Full screen switch.
-->
{#snippet header(title: string, current: boolean)}
	<PageHeader trail={current ? [{ ...CHAT_CRUMB, current: true }] : [CHAT_CRUMB, { label: title, href: '/chat/a1b2c3d4e5', current: true }]} {title}>
		{#snippet pinned()}<ChatSidebarToggle /><ChatModeMenu value="fullscreen" onchange={() => {}} align="start" />{/snippet}
	</PageHeader>
{/snippet}

{#snippet thread()}
	{@render header(threads[0].title, false)}
	<ChatPane>
		<ChatConversation messages={long} viewerId={owner.id} />
		{#snippet footer()}<ChatPromptInput viewer={owner} onsend={() => true} label="Reply" compact />{/snippet}
	</ChatPane>
{/snippet}

<Story name="Open">
	{#snippet template(args)}<ChatLayout threads={args.threads ?? threads} currentId={args.currentId} now={args.now} searchable={args.searchable} initial="open">{@render thread()}</ChatLayout>{/snippet}
</Story>

<Story name="Closed">
	{#snippet template(args)}<ChatLayout threads={args.threads ?? threads} currentId={args.currentId} now={args.now} searchable={args.searchable} initial="closed">{@render thread()}</ChatLayout>{/snippet}
</Story>

<Story name="By screen width">
	{#snippet template(args)}<ChatLayout threads={args.threads ?? threads} currentId={args.currentId} now={args.now} searchable={args.searchable}>{@render thread()}</ChatLayout>{/snippet}
</Story>

<!-- Starting a chat: the composer waits in the middle of the page. -->
<Story name="New chat" args={{ currentId: undefined }}>
	{#snippet template(args)}
		<ChatLayout threads={args.threads ?? threads} now={args.now} searchable={args.searchable} initial="open">
			{@render header('Chat', true)}
			<ChatPane centered><ChatPromptInput viewer={owner} onsend={() => true} placeholder="Start a new chat" compact /></ChatPane>
		</ChatLayout>
	{/snippet}
</Story>
