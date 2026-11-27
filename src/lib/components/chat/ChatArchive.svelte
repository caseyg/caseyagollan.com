<script lang="ts">
	import { chatAgo, chatHref, type ChatThreadSummary } from '$lib/chat';
	import { Button, Notice } from '$lib/components/ui';
	import type { ManagedChat } from './manage.svelte';

	interface Props {
		/** The archived chats, most recently active first. */
		threads: ChatThreadSummary[];
		now?: number;
		onunarchive: (chat: ManagedChat) => void;
		/** Delete it; whoever handles this asks first. */
		ondelete: (chat: ManagedChat) => void;
		/** Why an action on a chat didn't work. */
		error?: string;
	}

	let { threads, now = Date.now(), onunarchive, ondelete, error = '' }: Props = $props();
</script>

<!-- The chats Casey has put away: each opens as it always did, and can go back to the list of chats or be deleted. -->
{#if error}<Notice tone="error">{error}</Notice>{/if}
{#if threads.length}
	<ul class="chat-archive">
		{#each threads as thread (thread.id)}
			<li>
				<a href={chatHref(thread.id)}>
					<span class="title">{thread.title}</span>
					<span class="meta">Last active <time datetime={new Date(thread.updatedAt).toISOString()}>{chatAgo(thread.updatedAt, now)}</time>{#if thread.archivedAt}, archived <time datetime={new Date(thread.archivedAt).toISOString()}>{chatAgo(thread.archivedAt, now)}</time>{/if}</span>
				</a>
				<span class="actions">
					<Button size="sm" onclick={() => onunarchive(thread)}>Unarchive</Button>
					<Button size="sm" variant="quiet" onclick={() => ondelete(thread)}>Delete…</Button>
				</span>
			</li>
		{/each}
	</ul>
{:else}
	<p class="empty">Nothing is archived. Archive a chat from its ⋯ menu to keep it out of the list without deleting it.</p>
{/if}

<style>
	.chat-archive {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-3) 0;
	}

	li + li {
		border-top: 1px solid var(--border-subtle);
	}

	a {
		display: flex;
		flex: 1 1 14rem;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	.title {
		overflow: hidden;
		font-weight: var(--fw-medium);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	a:hover .title {
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.meta {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.actions {
		display: inline-flex;
		gap: var(--space-1);
	}

	.empty {
		color: var(--text-muted);
	}
</style>
