<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** `reading` is the post measure; `wide` suits forms and account pages; `full` spans the window, for galleries. */
		width?: 'reading' | 'wide' | 'full';
		/** Element to render, e.g. `main` for standalone pages. */
		as?: 'div' | 'main';
		class?: string;
		children: Snippet;
		/**
		 * A column beside the text on wide screens, after it on narrow ones, such as a page's outline
		 * and related links. The text keeps its measure either way.
		 */
		aside?: Snippet;
		/** Names the aside for assistive technology. */
		asideLabel?: string;
		[key: string]: unknown;
	}

	let { width = 'reading', as = 'div', class: className = '', children, aside, asideLabel = 'About this page', ...rest }: Props = $props();
</script>

<svelte:element this={as} class="page page--{width} {className}" class:page--aside={!!aside} {...rest}>
	{#if aside}
		<div class="page-main">{@render children()}</div>
		<aside class="page-aside" aria-label={asideLabel}>{@render aside()}</aside>
	{:else}
		{@render children()}
	{/if}
</svelte:element>

<style>
	/* Reading-scale type lives on the page container, so the homepage's fluid body type is untouched. */
	.page {
		margin: 0 auto;
		padding: var(--space-6) var(--space-5) var(--space-7);
		font-size: var(--fs-md);
		font-weight: var(--fw-regular);
		line-height: 1.6;
		overflow-wrap: break-word;
	}

	.page--reading {
		max-width: var(--measure);
	}

	.page--wide {
		max-width: var(--measure-wide);
		font-size: var(--fs-base);
	}

	.page--full {
		max-width: none;
		/* Nothing sits beside the pinned trail and navigation, so the page always starts below them. */
		padding-top: calc(var(--nav-lane) + var(--space-5));
	}

	.page-main {
		min-width: 0;
	}

	.page-aside {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		margin-top: var(--space-7);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}

	/* Wide enough for both: the text keeps its measure and the aside follows the reader down the page. */
	@media (min-width: 1100px) {
		.page--aside {
			display: grid;
			grid-template-columns: minmax(0, var(--measure)) var(--aside-width);
			gap: var(--space-7);
			max-width: calc(var(--measure) + var(--aside-width) + var(--space-7));
			--aside-width: 17rem;
		}

		.page-aside {
			position: sticky;
			top: calc(var(--sticky-top, 0px) + var(--space-6));
			align-self: start;
			max-height: calc(100vh - var(--sticky-top, 0px) - var(--space-7));
			margin-top: 0;
			padding-top: 0;
			overflow-y: auto;
			border-top: 0;
			scrollbar-width: thin;
		}
	}

	/*
	 * Where the pinned trail and navigation would sit over the reading column, the page starts below
	 * them. `Nav` draws the band of ground colour that keeps scrolling content out of their row.
	 */
	@media (max-width: 1360px) {
		:global(body:has(.site-nav, .page-header)) {
			--sticky-top: calc(var(--nav-lane) + var(--nav-inset));
		}

		:global(body:has(.site-nav, .page-header)) .page {
			padding-top: calc(var(--nav-lane) + var(--space-5));
		}
	}

	@media (max-width: 600px) {
		.page {
			padding: var(--space-5) var(--space-4) var(--space-6);
			font-size: var(--fs-base);
		}
	}
</style>
