<script lang="ts">
	import type { TableSummary } from '$lib/tables';
	import { isPublished } from '$lib/tables';
	import Chip from '../ui/Chip.svelte';
	import BlockCard from './BlockCard.svelte';

	interface Props {
		table: Pick<TableSummary, 'name' | 'count' | 'updated' | 'preview' | 'published'>;
		href: string;
		/** A picture of the whole table as it is laid out. Without one, the first blocks stand in. */
		thumbnail?: string;
	}

	let { table, href, thumbnail }: Props = $props();
	let failed = $state(false);

	const updated = $derived(new Date(table.updated).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }));
	const count = $derived(table.count === 1 ? '1 block' : `${table.count} blocks`);
</script>

<!-- A table on the browse page: a picture of it as laid out, then its name. -->
<a class="table-card" {href}>
	{#if thumbnail && !failed}
		<div class="surface surface--picture" aria-hidden="true">
			<img src={thumbnail} alt="" loading="lazy" decoding="async" onerror={() => (failed = true)} />
		</div>
	{:else}
		<div class="surface" class:empty={!table.preview.length} aria-hidden="true">
			{#each table.preview as block, index (index)}
				<div class="spot spot--{index}"><BlockCard {block} bare={!!block.image} /></div>
			{/each}
		</div>
	{/if}
	<h2 class="name">{table.name}</h2>
	<p class="meta">{#if !isPublished(table)}<Chip variant="soft" title="Only you can see this table">Draft</Chip>{/if}<span>{count} · {updated}</span></p>
</a>

<style>
	.table-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		color: var(--text-primary);
		text-decoration: none;
	}

	.surface {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-template-rows: repeat(2, 1fr);
		gap: var(--space-2);
		aspect-ratio: 4 / 3;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-sunken);
		overflow: hidden;
		transition: border-color var(--duration) var(--ease), scale 160ms var(--ease-out);
	}

	.surface--picture {
		display: block;
	}

	.surface--picture img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.surface.empty {
		background: repeating-linear-gradient(45deg, transparent 0 10px, var(--surface-1) 10px 11px), var(--surface-sunken);
	}

	.spot {
		min-width: 0;
		min-height: 0;
		/* Set down a little askew, as on a table. */
		rotate: -1.2deg;
	}

	.spot--1 { rotate: 1.4deg; }
	.spot--2 { rotate: 0.8deg; }
	.spot--3 { rotate: -0.6deg; }

	/* Thumbnail text is a fraction of its canvas size. */
	.spot :global(.block-card) {
		font-size: 0.7em;
	}

	.spot :global(.block-card .title) {
		font-size: var(--fs-xs);
	}

	.spot :global(.block-card .excerpt),
	.spot :global(.block-card .meta) {
		display: none;
	}

	.name {
		margin: var(--space-2) 0 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		line-height: var(--lh-tight);
	}

	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.table-card:active .surface {
		scale: 0.99;
	}

	@media (hover: hover) {
		.table-card:hover .surface {
			border-color: var(--text-primary);
		}
	}

	.table-card:focus-visible {
		outline: none;
	}

	.table-card:focus-visible .surface {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
</style>
