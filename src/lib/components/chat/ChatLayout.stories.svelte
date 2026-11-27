<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatLayout from './ChatLayout.svelte';
	import ChatConversation from './ChatConversation.svelte';
	import ChatModeMenu from './ChatModeMenu.svelte';
	import ChatPane from './ChatPane.svelte';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import ChatSidebarToggle from './ChatSidebarToggle.svelte';
	import { CHAT_CRUMB } from './index';
	import { Button, Notice, PageHeader } from '$lib/components/ui';
	import { conversation, owner, threads } from './fixtures';
	import ChatActionsMenu from './ChatActionsMenu.svelte';
	import ChatArchive from './ChatArchive.svelte';
	import { ChatManage, type ChatActions } from './manage.svelte';

	const { Story } = defineMeta({
		title: 'Chat/ChatLayout',
		component: ChatLayout,
		parameters: { layout: 'fullscreen' },
		args: { threads, currentId: threads[0].id, now: threads[0].updatedAt + 300_000, searchable: true }
	});

	/** Archiving and deleting that change nothing outside the story. */
	const pretend: ChatActions = {
		archive: async (id, archived) => ({ ...threads.find((thread) => thread.id === id)!, ...(archived ? { archivedAt: Date.now() } : {}) }),
		remove: async () => {}
	};

	const long = [...conversation.slice(0, 3).map((message) => ({ ...message, id: `${message.id}-before` })), ...conversation.slice(0, 3).map((message) => ({ ...message, id: `${message.id}-again` })), ...conversation];
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

<!-- A new chat couldn't be made: back at the box with the words still in it, to send again. -->
<Story name="New chat didn’t start" args={{ currentId: undefined }}>
	{#snippet template(args)}
		<ChatLayout threads={args.threads ?? threads} now={args.now} searchable={args.searchable} initial="open">
			{@render header('Chat', true)}
			<ChatPane centered>
				<Notice tone="error">That didn’t send: the site couldn’t be reached. <Button variant="quiet" size="sm">Try again</Button></Notice>
				<ChatPromptInput viewer={owner} value="What have I written about cooperatives this year?" onsend={() => true} placeholder="Start a new chat" compact />
			</ChatPane>
		</ChatLayout>
	{/snippet}
</Story>

<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';

	// Casey's view: chats leave the list as they are archived or deleted.
	const gone = new SvelteSet<string>();
	const manage = new ChatManage(pretend, ({ id, kind }) => (kind === 'unarchived' ? gone.delete(id) : gone.add(id)));
	const listed = $derived(threads.filter((thread) => !gone.has(thread.id)));
	const archived = $derived(threads.filter((thread) => gone.has(thread.id)).map((thread) => ({ ...thread, archivedAt: thread.updatedAt + 240_000 })));
	const asking = new ChatManage(pretend);
	void asking.remove(threads[0]);
</script>

<!--
	For Casey: each chat in the list has a ⋯ menu (hover, or right-click the row) with Archive and
	Delete, the open chat has the same menu in the trail, and Archived leads to the chats put away.
	Delete asks first.
-->
<Story name="Archive and delete">
	{#snippet template(args)}
		<ChatLayout threads={listed} currentId={args.currentId} now={args.now} searchable={args.searchable} {manage} archivedHref="/chat/archived" initial="open">
			<PageHeader trail={[CHAT_CRUMB, { label: threads[0].title, href: '/chat/a1b2c3d4e5', current: true }]} title={threads[0].title}>
				{#snippet pinned()}<ChatSidebarToggle /><ChatModeMenu value="fullscreen" onchange={() => {}} align="start" /><ChatActionsMenu chat={threads[0]} onarchive={(chat) => void manage.archive(chat)} ondelete={(chat) => void manage.remove(chat)} />{/snippet}
			</PageHeader>
			<ChatPane>
				<ChatConversation messages={long} viewerId={owner.id} />
				{#snippet footer()}<ChatPromptInput viewer={owner} onsend={() => true} label="Reply" compact />{/snippet}
			</ChatPane>
		</ChatLayout>
	{/snippet}
</Story>

<!-- Delete asks first, and says archiving is the other way to get a chat out of the list. -->
<Story name="Asking before a delete">
	{#snippet template(args)}<ChatLayout threads={args.threads ?? threads} currentId={args.currentId} now={args.now} manage={asking} archivedHref="/chat/archived" initial="open">{@render thread()}</ChatLayout>{/snippet}
</Story>

<!-- The archive: the chats put away, each to bring back or delete. Archive some in “Archive and delete” to see them here. -->
<Story name="Archived chats" args={{ currentId: undefined }}>
	{#snippet template(args)}
		<ChatLayout threads={listed} now={args.now} {manage} archivedHref="/chat/archived" archivedCurrent initial="open">
			<PageHeader trail={[CHAT_CRUMB, { label: 'Archived', href: '/chat/archived', current: true }]} title="Archived chats">
				{#snippet pinned()}<ChatSidebarToggle />{/snippet}
			</PageHeader>
			<ChatPane>
				<ChatArchive threads={archived.length ? archived : threads.slice(-2).map((thread) => ({ ...thread, archivedAt: thread.updatedAt + 240_000 }))} now={args.now} onunarchive={(chat) => void manage.archive(chat, false)} ondelete={(chat) => void manage.remove(chat)} />
			</ChatPane>
		</ChatLayout>
	{/snippet}
</Story>
