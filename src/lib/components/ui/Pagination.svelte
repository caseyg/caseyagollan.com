<script lang="ts">
	import { Pagination, PaginationItem, PaginationList, PaginationNext, PaginationPrevious } from '@ui-sdk/svelte/pagination';

	interface Props {
		page: number;
		totalPages: number;
		/** The URL of a page, from 1. Steps are links, so paging works before JavaScript loads. */
		href: (page: number) => string;
		prevLabel?: string;
		nextLabel?: string;
		/** Accessible name for the landmark. */
		label?: string;
	}

	let { page, totalPages, href, prevLabel = 'Newer', nextLabel = 'Older', label = 'Pagination' }: Props = $props();
</script>

{#if totalPages > 1}
	<Pagination class="pagination" aria-label={label} {page} pageCount={totalPages} getHref={href}>
		<PaginationList class="pagination-list">
			<PaginationItem><PaginationPrevious class="pagination-step" rel="prev"><span aria-hidden="true">←</span> {prevLabel}</PaginationPrevious></PaginationItem>
			<li class="status">Page {page} of {totalPages}</li>
			<PaginationItem class="pagination-end"><PaginationNext class="pagination-step" rel="next">{nextLabel} <span aria-hidden="true">→</span></PaginationNext></PaginationItem>
		</PaginationList>
	</Pagination>
{/if}

<style>
	:global(.pagination) {
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	:global(.pagination-list) {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	:global(.pagination-end) {
		text-align: right;
	}

	.status {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	:global(.pagination-step) {
		display: inline-block;
		margin-inline: calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		text-decoration: none;
		transition: background var(--duration) var(--ease);
	}

	/* At either end the step has nowhere to go. */
	:global(.pagination-step[data-disabled]) {
		visibility: hidden;
	}

	@media (hover: hover) {
		:global(.pagination-step:hover) {
			background: var(--surface-2);
		}
	}
</style>
