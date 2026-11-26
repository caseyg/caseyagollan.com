<script lang="ts">
	import { tagRef } from '$lib/tag-edits';
	import { tagsOn, tagStore } from '$lib/tag-edits.svelte';
	import type { Block } from '$lib/tables';
	import TagChips from '../tags/TagChips.svelte';
	import BlockCard from './BlockCard.svelte';

	interface Props {
		block: Block;
		/** Shows the block's details: its source line, its kind tile, and (for whoever edits the table) its tags. */
		details?: boolean;
	}

	let { block, details = true }: Props = $props();

	// Tags are read by whoever can change them (the owner); everyone else sees the card alone.
	const ref = $derived(details && tagStore.enabled ? tagRef(block) : null);
	const tags = $derived(tagsOn(ref));
	const staged = $derived(tags.some((tag) => tag.state !== 'kept'));
</script>

<!-- A block as it sits on a table: its card, and along its bottom edge the tags it has where it lives
     (a post's categories, a bookmark's tags), with staged changes marked. -->
<div class="table-block" class:staged>
	<BlockCard {block} {details} />
	{#if tags.length}
		<div class="tags"><TagChips {tags} clip label="Tags{staged ? ', with changes not saved yet' : ''}" /></div>
	{/if}
</div>

<style>
	.table-block {
		position: relative;
		width: 100%;
		height: 100%;
	}

	/* Laid over the card's bottom edge, so a block keeps the size it was given. */
	.tags {
		position: absolute;
		inset: auto 0 0;
		padding: var(--space-1);
		border-radius: 0 0 var(--radius-sm) var(--radius-sm);
		background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
		backdrop-filter: blur(3px);
		font-size: var(--fs-xs);
		pointer-events: none;
	}

	/* Changes waiting to be saved: a dashed line over the strip. */
	.staged .tags {
		border-top: 1px dashed var(--border-strong);
	}
</style>
