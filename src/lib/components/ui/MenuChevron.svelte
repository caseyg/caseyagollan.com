<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		/**
		 * Sets the chevron apart as a segment of its own, a divider between it and the label, so the
		 * trigger reads as a split button. Leave off for a quiet trigger with no outline to divide.
		 */
		split?: boolean;
	}

	let { split = true }: Props = $props();
</script>

<!--
	The chevron at the end of a button that opens a menu or panel. Place it last in the button, which
	gives up its own trailing padding; it turns over while the button carries `data-open`.
-->
<span class="menu-chevron" class:split aria-hidden="true"><Icon name="chevron" size={14} /></span>

<style>
	.menu-chevron {
		display: inline-grid;
		flex: none;
		place-items: center;
	}

	/* As tall as the button, whatever padding the button keeps for its label. */
	.menu-chevron.split {
		align-self: stretch;
		margin-block: calc(-1 * var(--menu-chevron-bleed, 0px));
		margin-inline-start: var(--space-1);
		padding-inline: var(--space-2);
		box-shadow: inset 1px 0 0 var(--menu-chevron-divider, var(--seg-divider, var(--segment-divider)));
	}

	.menu-chevron :global(svg) {
		transition: transform 200ms var(--ease-out);
	}

	:global([data-open]) > .menu-chevron :global(svg) {
		transform: rotate(180deg);
	}

	@media (prefers-reduced-motion: reduce) {
		.menu-chevron :global(svg) {
			transition: none;
		}
	}
</style>
