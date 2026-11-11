<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** `reading` is the post measure; `wide` suits forms and account pages. */
		width?: 'reading' | 'wide';
		/** Element to render, e.g. `main` for standalone pages. */
		as?: 'div' | 'main';
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	}

	let { width = 'reading', as = 'div', class: className = '', children, ...rest }: Props = $props();
</script>

<svelte:element this={as} class="page page--{width} {className}" {...rest}>
	{@render children()}
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

	@media (max-width: 600px) {
		.page {
			padding: var(--space-5) var(--space-4) var(--space-6);
			font-size: var(--fs-base);
		}
	}
</style>
