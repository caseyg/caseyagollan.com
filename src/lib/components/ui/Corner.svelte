<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** `start` is the top-left corner, for where you are; `end` is the top-right, for where you can go. */
		side?: 'start' | 'end';
		/** On a phone: stay `pinned`, drop back `inline` into the page, or be `hidden`. */
		phone?: 'pinned' | 'inline' | 'hidden';
		as?: 'div' | 'nav';
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	}

	let { side = 'start', phone = 'pinned', as = 'div', class: className = '', children, ...rest }: Props = $props();
</script>

<!-- Controls pinned to a top corner of the viewport, staying put while the page scrolls. -->
<svelte:element this={as} class="corner corner--{side} corner--phone-{phone} {className}" {...rest}>
	{@render children()}
</svelte:element>

<style>
	.corner {
		position: fixed;
		top: var(--nav-inset);
		z-index: var(--z-nav);
		display: flex;
		align-items: flex-start;
		gap: var(--nav-inset);
	}

	.corner--start {
		left: var(--nav-inset);
	}

	.corner--end {
		right: var(--nav-inset);
	}

	@media (max-width: 600px) {
		.corner--phone-inline {
			position: static;
			z-index: auto;
		}

		.corner--phone-hidden {
			display: none;
		}
	}
</style>
