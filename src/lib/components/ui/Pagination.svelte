<script lang="ts">
	interface Props {
		page: number;
		totalPages: number;
		prevHref?: string;
		nextHref?: string;
		prevLabel?: string;
		nextLabel?: string;
		/** Accessible name for the landmark. */
		label?: string;
	}

	let { page, totalPages, prevHref, nextHref, prevLabel = 'Newer', nextLabel = 'Older', label = 'Pagination' }: Props = $props();
</script>

{#if totalPages > 1}
	<nav class="pagination" aria-label={label}>
		<span class="slot">
			{#if prevHref}<a href={prevHref} rel="prev"><span aria-hidden="true">←</span> {prevLabel}</a>{/if}
		</span>
		<span class="status">Page {page} of {totalPages}</span>
		<span class="slot slot--end">
			{#if nextHref}<a href={nextHref} rel="next">{nextLabel} <span aria-hidden="true">→</span></a>{/if}
		</span>
	</nav>
{/if}

<style>
	.pagination {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--space-4);
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.slot--end {
		text-align: right;
	}

	.status {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	a {
		display: inline-block;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		text-decoration: none;
		transition: background var(--duration) var(--ease);
	}

	.slot:not(.slot--end) a {
		margin-left: calc(-1 * var(--space-2));
	}

	.slot--end a {
		margin-right: calc(-1 * var(--space-2));
	}

	a:hover {
		background: var(--surface-2);
	}
</style>
