<script lang="ts">
	import type { ChatToolUse } from '$lib/chat';
	import { Icon, LinkPreviewCard, type IconName } from '$lib/components/ui';

	interface Props {
		step: ChatToolUse;
	}

	let { step }: Props = $props();

	const ICON: Record<string, IconName> = { search_site: 'search', fetch_page: 'globe', show_page: 'globe', go_to: 'arrow', table_add_note: 'sticky', table_move: 'hand', table_arrange: 'fit', table_select: 'pointer', table_remove: 'eraser' };
	const icon = $derived<IconName>(ICON[step.tool] ?? (step.tool.startsWith('micropub_') ? 'article' : step.tool.startsWith('table_') || step.tool === 'create_table' ? 'box' : 'sparkle'));
	const hasLinks = $derived(!!step.links?.length);
</script>

<!-- One step the agent took, in gray: what it searched or read. Links open on demand; a page it showed is a card. -->
{#if step.peek}
	<div class="chat-tool chat-tool--peek" data-status={step.status}>
		<LinkPreviewCard class="peek" href={step.peek.url} title={step.peek.title} excerpt={step.peek.excerpt} />
	</div>
{:else if hasLinks}
	<details class="chat-tool" data-status={step.status}>
		<summary>
			<Icon name={icon} size={13} />
			<span class="label">{step.label}</span>
			<span class="more"><Icon name="chevron" size={12} /></span>
		</summary>
		<ul>
			{#each step.links ?? [] as link (link.url)}
				<li><a href={link.url} rel="nofollow noopener">{link.title}</a></li>
			{/each}
		</ul>
	</details>
{:else}
	<div class="chat-tool" data-status={step.status}>
		<span class="row">
			<Icon name={icon} size={13} />
			<span class="label">{step.label}{step.status === 'running' ? '…' : ''}</span>
			{#if step.status === 'failed'}<span class="failed">didn’t work</span>{/if}
		</span>
	</div>
{/if}

<style>
	/* A page the assistant showed sits in the reply, so it needs no popover shadow. */
	.chat-tool--peek :global(.peek) {
		box-shadow: none;
	}

	.chat-tool {
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
	}

	summary,
	.row {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.15rem var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-2);
	}

	summary {
		cursor: pointer;
		list-style: none;
		transition: color var(--duration) var(--ease);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover {
		color: var(--text-secondary);
	}

	.more {
		display: inline-flex;
		transition: transform var(--duration) var(--ease);
	}

	details[open] .more {
		transform: rotate(180deg);
	}

	[data-status='running'] .label {
		animation: chat-tool-pulse 1.4s var(--ease) infinite;
	}

	.failed {
		color: var(--text-secondary);
	}

	ul {
		margin: var(--space-1) 0 0;
		padding: 0 0 0 var(--space-4);
	}

	li {
		margin: 0.15rem 0;
	}

	a {
		color: var(--text-secondary);
		text-underline-offset: var(--underline-offset);
	}

	@keyframes chat-tool-pulse {
		50% { opacity: 0.45; }
	}

	@media (prefers-reduced-motion: reduce) {
		[data-status='running'] .label { animation: none; }
	}
</style>
