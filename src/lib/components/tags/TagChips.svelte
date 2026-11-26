<script lang="ts">
	import type { TagView } from '$lib/tag-edits';
	import Chip from '../ui/Chip.svelte';

	interface Props {
		/** Tags as they are, with staged changes marked: `added` (+) and `removed` (−, struck through). */
		tags: TagView[];
		/** One line, cut off where it runs out of room: the strip along the bottom of a card on a table. */
		clip?: boolean;
		/** Makes each tag a button: pressing one asks for it to be removed, or put back if it was about to go. */
		ontoggle?: (tag: TagView) => void;
		/** Names the list for assistive technology. */
		label?: string;
		class?: string;
	}

	let { tags, clip = false, ontoggle, label = 'Tags', class: className = '' }: Props = $props();

	const MARK = { kept: '', added: '+', removed: '−' } as const;
	const SAYS = { kept: '', added: ', to be added', removed: ', to be removed' } as const;
	const hint = (tag: TagView) => (tag.state === 'removed' ? `Keep “${tag.name}”` : tag.state === 'added' ? `Don’t add “${tag.name}”` : `Remove “${tag.name}”`);
</script>

{#if tags.length}
	<ul class="tag-chips {className}" class:clip aria-label={label}>
		{#each tags as tag (tag.name.toLowerCase())}
			<li>
				<Chip variant="soft" class="tag tag--{tag.state}" onclick={ontoggle ? () => ontoggle(tag) : undefined} title={ontoggle ? hint(tag) : undefined} aria-label="{tag.name}{SAYS[tag.state]}">
					{#if MARK[tag.state]}<span class="mark" aria-hidden="true">{MARK[tag.state]}</span>{/if}<span class="name">{tag.name}</span>
				</Chip>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.tag-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font-weight: var(--fw-regular);
	}

	.tag-chips li {
		display: flex;
		min-width: 0;
	}

	.clip {
		flex-wrap: nowrap;
		overflow: hidden;
		/* Tags that don't fit fade out at the edge rather than stopping mid-word. */
		mask-image: linear-gradient(to right, black calc(100% - 1.5rem), transparent);
	}

	.clip li {
		flex: none;
	}

	.tag-chips :global(.tag) {
		box-sizing: border-box;
		border: 1px solid transparent;
		max-width: 100%;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* A tag about to be added is outlined; one about to go is struck through and quieter. */
	.tag-chips :global(.tag--added) {
		border: 1px dashed var(--border-strong);
		background: transparent;
	}

	.tag-chips :global(.tag--removed) {
		background: transparent;
		color: var(--text-muted);
	}

	.tag-chips :global(.tag--removed .name) {
		text-decoration: line-through;
	}

	.mark {
		font-weight: var(--fw-semibold);
	}
</style>
