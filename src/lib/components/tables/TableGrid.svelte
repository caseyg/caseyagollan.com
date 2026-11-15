<script lang="ts">
	import type { TableSummary } from '$lib/tables';
	import TableCard from './TableCard.svelte';

	interface Props {
		tables: TableSummary[];
		/** Where each table opens. */
		href: (id: string) => string;
		/** Where each table's picture is, if it has one. */
		thumbnail?: (table: TableSummary) => string | undefined;
	}

	let { tables, href, thumbnail }: Props = $props();
</script>

{#if tables.length}
	<ul class="table-grid">
		{#each tables as table (table.id)}
			<li><TableCard {table} href={href(table.id)} thumbnail={thumbnail?.(table)} /></li>
		{/each}
	</ul>
{:else}
	<p class="empty">No tables yet.</p>
{/if}

<style>
	.table-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: var(--space-6) var(--space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		color: var(--text-muted);
	}
</style>
