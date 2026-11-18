<script lang="ts">
	import { chatAgo, chatHref, type ChatThreadSummary } from '$lib/chat';
	import { Button } from '$lib/components/ui';

	interface Props {
		/** Most recently active first. */
		threads: ChatThreadSummary[];
		/** The thread being read, marked as current. */
		currentId?: string;
		now?: number;
		/** Hides the sidebar; the button is left out without it. */
		onclose?: () => void;
		/** After a link is followed, so a sidebar covering the page can get out of the way. */
		onnavigate?: () => void;
		id?: string;
	}

	let { threads, currentId, now = Date.now(), onclose, onnavigate, id }: Props = $props();
</script>

<!-- The list of chats beside a thread, like a chat app's: newest activity on top, the open one marked. -->
<nav class="chat-sidebar" aria-label="Chats" {id}>
	<div class="head">
		<Button href="/chat" icon="plus" size="sm" onclick={onnavigate}>New chat</Button>
		{#if onclose}<Button variant="icon" size="sm" icon="sidebar" label="Hide chats" onclick={onclose} />{/if}
	</div>
	{#if threads.length}
		<ul>
			{#each threads as thread (thread.id)}
				<li>
					<a href={chatHref(thread.id)} aria-current={thread.id === currentId ? 'page' : undefined} onclick={onnavigate}>
						<span class="title">{thread.title}</span>
						<time datetime={new Date(thread.updatedAt).toISOString()}>{chatAgo(thread.updatedAt, now)}</time>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No chats yet.</p>
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
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: 0 var(--space-2);
	}

	ul {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0 var(--space-2) var(--space-4);
		overflow-y: auto;
		list-style: none;
		scrollbar-width: thin;
	}

	a {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: var(--space-2);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		text-decoration: none;
	}

	a:hover {
		background: var(--border-subtle);
		color: var(--text-primary);
	}

	/* The open chat takes the active colour, as in the site's navigation. */
	a[aria-current='page'] {
		background: var(--accent);
		color: var(--text-primary);
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	time {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	a[aria-current='page'] time {
		color: var(--text-secondary);
	}

	.empty {
		margin: 0;
		padding: 0 var(--space-4);
		color: var(--text-muted);
	}
</style>
