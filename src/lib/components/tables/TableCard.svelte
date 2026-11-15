<script lang="ts">
	import type { TableSummary } from '$lib/tables';
	import BlockCard from './BlockCard.svelte';

	interface Props {
		table: Pick<TableSummary, 'name' | 'count' | 'updated' | 'preview'>;
		href: string;
	}

	let { table, href }: Props = $props();

	const updated = $derived(new Date(table.updated).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }));
	const count = $derived(table.count === 1 ? '1 block' : `${table.count} blocks`);
</script>

<!-- A table on the browse page: its first blocks laid out like a tabletop, then its name. -->
<a class="table-card" {href}>
	<div class="surface" class:empty={!table.preview.length} aria-hidden="true">
		{#each table.preview as block, index (index)}
			<div class="spot spot--{index}"><BlockCard {block} bare={!!block.image} /></div>
		{/each}
	</div>
	<h2 class="name">{table.name}</h2>
	<p class="meta">{count} · {updated}</p>
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
