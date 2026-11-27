<script lang="ts">
	import { chatHref, type ChatSendOptions } from '$lib/chat';
	import type { LiveThread } from '$lib/chat-client.svelte';
	import { Button, Notice, PageHeader } from '$lib/components/ui';
	import { usePageCommands } from '$lib/page-commands.svelte';
	import ChatActionsMenu from './ChatActionsMenu.svelte';
	import ChatConversation from './ChatConversation.svelte';
	import ChatModeMenu, { type ChatPlace } from './ChatModeMenu.svelte';
	import ChatPane from './ChatPane.svelte';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import ChatSidebarToggle from './ChatSidebarToggle.svelte';
	import ChatSignIn from './ChatSignIn.svelte';
	import { CHAT_CRUMB } from './crumb';
	import { useChatManage } from './manage.svelte';

	interface Props {
		/** The thread, live; or one just begun (`LiveThread.begin`), shown while it is made. */
		live: LiveThread;
		/** What is being written in reply. */
		text?: string;
		/** Something to say above the composer, such as why a posted form was refused. */
		error?: string;
		signinError?: string | null;
		/** The page has a form action that takes a reply, for when the connection isn't open (and without JavaScript). */
		posts?: boolean;
		/** Casey chose Sidebar or Floating: the chat leaves full screen. */
		onplace?: (choice: ChatPlace) => void;
	}

	let { live, text = $bindable(''), error = '', signinError = null, posts = false, onplace }: Props = $props();

	// Casey's Archive and Delete, where the layout offers them and once the chat has an address.
	const manage = useChatManage();
	const manageable = $derived(!!manage && !!live.snapshot.thread.id && !live.removed);

	// Whether it is archived may have changed since the page loaded, here or from the list beside it.
	const chat = $derived(manage ? manage.current(live.snapshot.thread) : live.snapshot.thread);
	const archive = () => void manage?.archive(chat);
	// The layout moves on from a deleted chat.
	const remove = () => void manage?.remove(chat);

	usePageCommands(() => (manageable ? [{
		label: 'This chat',
		items: [
			{ value: 'chat:archive', label: chat.archivedAt ? 'Unarchive this chat' : 'Archive this chat', icon: '🗄️', keywords: ['hide', 'put away'] },
			{ value: 'chat:delete', label: 'Delete this chat…', icon: '🗑️', keywords: ['remove', 'trash'] }
		],
		run: (value: string) => (value === 'chat:archive' ? archive() : remove())
	}] : []));

	const viewer = $derived(live.viewer);
	const thread = $derived(live.snapshot.thread);
	// A chat that is still being made has no address yet.
	const href = $derived(thread.id ? chatHref(thread.id) : undefined);

	const send = (value: string, { queue }: ChatSendOptions) => live.say(value, undefined, queue);
</script>

<!-- A chat, full screen: its title in the trail, the conversation scrolling by itself, and the composer held at the bottom. -->
<PageHeader trail={[CHAT_CRUMB, { label: thread.title, href, current: true }]} title={thread.title}>
	{#snippet pinned()}<ChatSidebarToggle />{#if viewer?.owner && onplace}<ChatModeMenu value="fullscreen" onchange={onplace} align="start" />{/if}{#if manageable}<ChatActionsMenu {chat} onarchive={archive} ondelete={remove} />{/if}{/snippet}
</PageHeader>

<ChatPane>
	<ChatConversation messages={live.messages} viewerId={viewer?.id} />
	{#snippet footer()}
		{#if live.error || error}<Notice tone="error">{live.error || error}</Notice>{/if}
		{#if manage?.error}<Notice tone="error">{manage.error}</Notice>{/if}
		{#if live.removed}
			<Notice>This chat was deleted. <Button variant="quiet" size="sm" href={CHAT_CRUMB.href}>Start a new chat</Button></Notice>
		{:else if chat.archivedAt}
			<Notice>This chat is archived.{#if manageable} <Button variant="quiet" size="sm" onclick={archive}>Unarchive</Button>{/if}</Notice>
		{/if}
		{#if live.status === 'offline' && !live.removed}<Notice>Reconnecting… new messages will show up when it’s back.</Notice>{/if}
		{#if live.removed}
			<!-- Nothing left to reply to. -->
		{:else if viewer}
			<!-- Over the socket when it's open; otherwise the form posts, where the page takes one. -->
			<ChatPromptInput {viewer} bind:value={text} onsend={posts && live.status !== 'live' ? undefined : send} returnTo={href ?? CHAT_CRUMB.href} tools={live.tools} choices={live.choices} onchoices={(off) => live.setOff(off)} label="Reply" compact />
		{:else}
			<ChatSignIn returnTo={href ?? CHAT_CRUMB.href} error={signinError} open={!!signinError} />
		{/if}
	{/snippet}
</ChatPane>
