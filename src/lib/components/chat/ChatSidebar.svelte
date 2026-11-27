<script lang="ts">
	import { useShortcutHint } from '@ui-sdk/svelte/shortcuts';
	import { chatHref, type ChatThreadSummary } from '$lib/chat';
	import { groupChatsByDate } from '$lib/chat-search';
	import { Icon, Notice } from '$lib/components/ui';
	import ChatActionsMenu from './ChatActionsMenu.svelte';
	import type { ManagedChat } from './manage.svelte';

	interface Props {
		/** Most recently active first. */
		threads: ChatThreadSummary[];
		/** The thread being read, marked as current. */
		currentId?: string;
		now?: number;
		/** Opens the search of chats; the row is left out without it. */
		onsearch?: () => void;
		/** After a link is followed, so a sidebar covering the page can get out of the way. */
		onnavigate?: () => void;
		/** Casey's actions on a chat: each row gets a ⋯ menu (and a right-click) with Archive and Delete. Left out for anyone else. */
		onarchive?: (chat: ManagedChat) => void;
		ondelete?: (chat: ManagedChat) => void;
		/** Where the archived chats are; the row is left out without it. */
		archivedHref?: string;
		/** The archive is the page being read. */
		archivedCurrent?: boolean;
		/** Why an action on a chat didn't work. */
		error?: string;
		id?: string;
	}

	let { threads, currentId, now = Date.now(), onsearch, onnavigate, onarchive, ondelete, archivedHref, archivedCurrent = false, error = '', id }: Props = $props();

	const menus = $state<Record<string, ChatActionsMenu | undefined>>({});
	/** The chat whose menu is open: its ⋯ stays showing while it is. */
	let menuOpen = $state('');

	function rightClick(event: MouseEvent, chat: string) {
		const menu = menus[chat];
		if (!menu) return;
		event.preventDefault();
		void menu.openAt({ x: event.clientX, y: event.clientY });
	}

	const groups = $derived(groupChatsByDate(threads, now));
	const hint = useShortcutHint(() => 'mod+k');
</script>

<!-- The list of chats beside a thread, like a chat app's: New chat and Search on top, then every chat under the day it last moved, the open one marked. -->
<nav class="chat-sidebar" aria-label="Chats" {id}>
	<div class="actions">
		<a class="row" href="/chat" aria-current={currentId || archivedCurrent ? undefined : 'page'} onclick={onnavigate}><Icon name="plus" size={16} /><span class="title">New chat</span></a>
		{#if onsearch}
			<button type="button" class="row" onclick={onsearch}><Icon name="search" size={16} /><span class="title">Search chats</span>{#if hint.text}<kbd aria-hidden="true">{hint.text}</kbd>{/if}</button>
		{/if}
	</div>
	{#if error}<div class="problem"><Notice tone="error">{error}</Notice></div>{/if}
	<div class="list">
		{#each groups as group (group.label)}
			<section>
				<h2>{group.label}</h2>
				<ul>
					{#each group.threads as thread (thread.id)}
						<li class="chat" class:managed={!!(onarchive && ondelete)} class:menu-open={menuOpen === thread.id} oncontextmenu={(event) => rightClick(event, thread.id)}>
							<a class="row" href={chatHref(thread.id)} aria-current={thread.id === currentId ? 'page' : undefined} title={thread.title} onclick={onnavigate}><span class="title">{thread.title}</span></a>
							{#if onarchive && ondelete}
								<span class="more"><ChatActionsMenu bind:this={menus[thread.id]} chat={thread} {onarchive} {ondelete} bind:open={() => menuOpen === thread.id, (open) => { menuOpen = open ? thread.id : menuOpen === thread.id ? '' : menuOpen; }} /></span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{:else}
			<p class="empty">No chats yet.</p>
		{/each}
	</div>
	<!-- Held at the foot of the list, in the window's bottom left corner, away from New chat and Search. -->
	{#if archivedHref}
		<div class="actions foot">
			<a class="row" href={archivedHref} aria-current={archivedCurrent ? 'page' : undefined} onclick={onnavigate}><Icon name="archive" size={16} /><span class="title">Archived</span></a>
		</div>
	{/if}
</nav>

<style>
	.chat-sidebar {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		height: 100%;
		min-height: 0;
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.actions {
		display: flex;
		flex-direction: column;
		padding: 0 var(--space-2);
	}

	.list {
		flex: 1;
		min-height: 0;
		padding: 0 var(--space-2) var(--space-2);
		overflow-y: auto;
		scrollbar-width: thin;
	}

	section + section {
		margin-top: var(--space-4);
	}

	h2 {
		margin: 0;
		padding: var(--space-1) var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		box-sizing: border-box;
		width: 100%;
		padding: var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-secondary);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: background var(--duration) var(--ease);
	}

	.actions .row {
		color: var(--text-primary);
	}

	.actions .row[aria-current='page'] {
		background: var(--surface-2);
	}

	.foot {
		padding-bottom: var(--space-2);
	}

	.foot .row {
		color: var(--text-secondary);
	}

	.problem {
		padding: 0 var(--space-2);
	}

	.problem :global(.notice) {
		margin: 0;
	}

	.chat {
		position: relative;
	}

	/* A chat's ⋯ sits over the end of its row: there on hover, with the keyboard, and while its menu is open. */
	.more {
		position: absolute;
		top: 50%;
		right: var(--space-1);
		translate: 0 -50%;
		opacity: 0;
	}

	.chat:hover .more,
	.chat:focus-within .more,
	.chat.menu-open .more {
		opacity: 1;
	}

	.chat.managed:hover .row,
	.chat.managed:focus-within .row,
	.chat.menu-open .row {
		padding-right: calc(1.75rem + var(--space-2));
	}

	.chat.menu-open .row {
		background: var(--border-subtle);
		color: var(--text-primary);
	}

	/* Nothing hovers on a touch screen, so the ⋯ is always there. */
	@media (hover: none) {
		.more {
			opacity: 1;
		}

		.chat.managed .row {
			padding-right: calc(1.75rem + var(--space-2));
		}
	}

	.row:hover {
		background: var(--border-subtle);
		color: var(--text-primary);
	}

	/* The open chat is marked in gray, as a control in the page is; blue stays with the site's navigation. */
	.list .row[aria-current='page'] {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	kbd {
		color: var(--text-muted);
		font: inherit;
		font-size: var(--fs-xs);
	}

	.empty {
		margin: 0;
		padding: var(--space-2);
		color: var(--text-muted);
	}
</style>
