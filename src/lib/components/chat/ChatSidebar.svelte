<script lang="ts">
	import { useShortcutHint } from '@ui-sdk/svelte/shortcuts';
	import { chatHref, type ChatThreadSummary } from '$lib/chat';
	import { groupChatsByDate } from '$lib/chat-search';
	import { Icon } from '$lib/components/ui';

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
		id?: string;
	}

	let { threads, currentId, now = Date.now(), onsearch, onnavigate, id }: Props = $props();

	const groups = $derived(groupChatsByDate(threads, now));
	const hint = useShortcutHint(() => 'mod+k');
</script>

<!-- The list of chats beside a thread, like a chat app's: New chat and Search on top, then every chat under the day it last moved, the open one marked. -->
<nav class="chat-sidebar" aria-label="Chats" {id}>
	<div class="actions">
		<a class="row" href="/chat" aria-current={currentId ? undefined : 'page'} onclick={onnavigate}><Icon name="plus" size={16} /><span class="title">New chat</span></a>
		{#if onsearch}
			<button type="button" class="row" onclick={onsearch}><Icon name="search" size={16} /><span class="title">Search chats</span>{#if hint.text}<kbd aria-hidden="true">{hint.text}</kbd>{/if}</button>
		{/if}
	</div>
	<div class="list">
		{#each groups as group (group.label)}
			<section>
				<h2>{group.label}</h2>
				<ul>
					{#each group.threads as thread (thread.id)}
						<li><a class="row" href={chatHref(thread.id)} aria-current={thread.id === currentId ? 'page' : undefined} title={thread.title} onclick={onnavigate}><span class="title">{thread.title}</span></a></li>
					{/each}
				</ul>
			</section>
		{:else}
			<p class="empty">No chats yet.</p>
		{/each}
	</div>
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
		padding: 0 var(--space-2) var(--space-4);
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
