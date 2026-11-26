<script lang="ts">
	import type { ChatSelectionItem } from '$lib/chat';
	import { Chip, Icon } from '$lib/components/ui';

	interface Props {
		/** What is selected: every item, or the first few of `count`. */
		items: ChatSelectionItem[];
		/** How many are selected, when `items` holds only the first few. */
		count?: number;
		/** Shown above the composer: a button that clears the selection. Without it, a quiet label on a sent message. */
		onclear?: () => void;
	}

	let { items, count: total, onclear }: Props = $props();

	// Derived, not a prop default: a default is worked out once, so the chip kept its first count as the selection grew.
	const count = $derived(total ?? items.length);

	const only = $derived(count === 1 ? items[0] : undefined);
	const label = $derived(only ? (only.title ?? `1 ${only.type}`) : `${count} selected`);
	const names = $derived(items.map((item) => item.title ?? item.type).join(', ') + (count > items.length ? `, and ${count - items.length} more` : ''));
</script>

<!-- What the assistant is told is selected on the table, so “these” is visible before and after sending. -->
<div class="chat-selection" class:sent={!onclear} title={names}>
	<Chip variant={onclear ? 'soft' : 'ghost'}>
		<Icon name="pointer" size={12} />
		<span class="label">{label}</span>
		{#if onclear}<span class="visually-hidden">is selected on the table; the assistant will act on {count === 1 ? 'it' : 'them'}</span>{/if}
	</Chip>
	{#if onclear}
		<button type="button" class="clear" onclick={onclear} aria-label="Clear the selection">
			<Icon name="close" size={12} />
		</button>
	{/if}
</div>

<style>
	.chat-selection {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		color: var(--text-secondary);
	}

	.chat-selection.sent {
		justify-content: flex-end;
	}

	.chat-selection :global(.chip) {
		min-width: 0;
	}

	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 22ch;
	}

	.clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.clear:hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}

</style>
