<script lang="ts">
	import Icon from '../ui/Icon.svelte';

	interface Props {
		onclick: () => void;
		/** While the table is being made: the card can't be pressed again. */
		busy?: boolean;
	}

	let { onclick, busy = false }: Props = $props();
</script>

<!--
	The first place in the browse grid: an empty spot the size of a table, to start a new one.
	Gray like the page's other in-content controls; blue is kept for the navigation.
-->
<button class="new-table-card" type="button" {onclick} disabled={busy} aria-busy={busy}>
	<span class="surface" aria-hidden="true"><Icon name="plus" size={28} /></span>
	<span class="name">{busy ? 'Making a table…' : 'New table'}</span>
	<span class="meta">Starts empty, as a draft</span>
</button>

<style>
	.new-table-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		width: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-secondary);
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	/* The same shape as a table's picture (TableCard), drawn as an outline: nothing is here yet. */
	.surface {
		display: grid;
		place-items: center;
		aspect-ratio: 4 / 3;
		padding: var(--space-3);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-md);
		transition: border-color var(--duration) var(--ease), background var(--duration) var(--ease), color var(--duration) var(--ease), scale 160ms var(--ease-out);
	}

	.name {
		margin-top: var(--space-2);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		line-height: var(--lh-tight);
	}

	.meta {
		color: var(--text-muted);
		font-size: var(--fs-xs);
		/* Lines up with the cards beside it, whose line holds a chip. */
		line-height: var(--lh-normal);
	}

	.new-table-card:active:not(:disabled) .surface {
		scale: 0.99;
	}

	/* One card to a row (phones): a short strip, so the tables themselves stay in view. */
	@media (max-width: 34rem) {
		.surface {
			aspect-ratio: auto;
			height: 4.5rem;
			padding: 0;
		}
	}

	@media (hover: hover) {
		.new-table-card:hover:not(:disabled) {
			color: var(--text-primary);
		}

		.new-table-card:hover:not(:disabled) .surface {
			border-color: var(--text-primary);
			background: var(--surface-sunken);
		}
	}

	.new-table-card:focus-visible {
		outline: none;
	}

	.new-table-card:focus-visible .surface {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	.new-table-card:disabled {
		opacity: 0.6;
		cursor: default;
	}

	@media (prefers-reduced-motion: reduce) {
		.new-table-card:active:not(:disabled) .surface {
			scale: none;
		}
	}
</style>
