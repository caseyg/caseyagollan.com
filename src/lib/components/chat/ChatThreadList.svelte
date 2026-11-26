<script lang="ts">
	import { chatAgo, chatHref, type ChatThreadSummary } from '$lib/chat';
	import { Avatar, Count } from '$lib/components/ui';

	interface Props {
		threads: ChatThreadSummary[];
		now?: number;
		/** Open a chat in place instead of following its link, as the site-wide chat does. */
		onselect?: (id: string) => void;
		/** The chat that's open, marked as current. */
		current?: string;
		/** One line per chat: title and when it last moved, no people or counts. */
		compact?: boolean;
	}

	let { threads, now = Date.now(), onselect, current, compact = false }: Props = $props();

	function select(event: MouseEvent, id: string) {
		if (!onselect || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		onselect(id);
	}

	const ago = (at: number) => chatAgo(at, now);
</script>

<!-- Chat threads, most recently active first: title, who's in it, and when it last moved. -->
{#if threads.length}
	<ul class="chat-thread-list" class:compact>
		{#each threads as thread (thread.id)}
			<li>
				<a href={chatHref(thread.id)} aria-current={thread.id === current ? 'true' : undefined} onclick={(event) => select(event, thread.id)}>
					<span class="title">{thread.title}</span>
					<span class="meta">
						{#if !compact}
							<span class="people" aria-label="{thread.participants?.length ?? 0} people">
								{#each (thread.participants ?? []).slice(0, 4) as person (person.id)}<Avatar src={person.photo} name={person.name} size="sm" />{/each}
							</span>
							<Count value={thread.messageCount} label="{thread.messageCount} messages" />
						{/if}
						<time datetime={new Date(thread.updatedAt).toISOString()}>{ago(thread.updatedAt)}</time>
					</span>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<p class="empty">No chats yet.</p>
{/if}

<style>
	.chat-thread-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li + li {
		border-top: 1px solid var(--border-subtle);
	}

	a {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-3) 0;
		color: inherit;
		text-decoration: none;
	}

	a:hover .title {
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.title {
		min-width: 0;
		font-weight: var(--fw-medium);
	}

	.meta {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.people {
		display: inline-flex;
	}

	.people :global(.avatar) {
		width: 1.4rem;
		height: 1.4rem;
		margin-left: -0.35rem;
		border: 2px solid var(--bg-primary);
		font-size: 0.65rem;
	}

	.people :global(.avatar:first-child) {
		margin-left: 0;
	}

	.empty {
		color: var(--text-muted);
	}

	.compact a {
		flex-wrap: nowrap;
		padding: var(--space-2) 0;
		font-size: var(--fs-sm);
	}

	.compact .title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.compact .meta {
		flex-shrink: 0;
	}

	a[aria-current] .title {
		font-weight: var(--fw-semibold);
	}
</style>
