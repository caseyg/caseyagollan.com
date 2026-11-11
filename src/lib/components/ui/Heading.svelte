<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Semantic level; independent of visual size. */
		level?: 1 | 2 | 3 | 4;
		/** Render a non-heading element when the text is not part of the outline, e.g. an overline. */
		as?: 'p' | 'span';
		/**
		 * `display`: standalone page titles. `title`: a post on its own page.
		 * `section`: page sections. `subtitle`: a post within a feed. `label`: small overlines.
		 */
		size?: 'display' | 'title' | 'section' | 'subtitle' | 'label';
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	}

	let { level = 2, as, size = 'section', class: className = '', children, ...rest }: Props = $props();
</script>

<svelte:element this={as ?? `h${level}`} class="heading heading--{size} {className}" {...rest}>
	{@render children()}
</svelte:element>

<style>
	.heading {
		margin: 0;
		color: var(--text-primary);
		text-wrap: balance;
		overflow-wrap: break-word;
	}

	.heading--display {
		font-size: var(--fs-3xl);
		font-weight: var(--fw-regular);
		line-height: 1.1;
		letter-spacing: -0.025em;
	}

	.heading--title {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-semibold);
		line-height: 1.25;
		letter-spacing: var(--tracking-tight);
	}

	.heading--section {
		font-size: var(--fs-xl);
		font-weight: var(--fw-medium);
		line-height: 1.3;
		letter-spacing: var(--tracking-tight);
	}

	.heading--subtitle {
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
		line-height: 1.3;
		letter-spacing: -0.005em;
	}

	.heading--label {
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: var(--lh-snug);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
	}

	@media (max-width: 600px) {
		.heading--display {
			font-size: var(--fs-2xl);
		}

		.heading--title {
			font-size: var(--fs-xl);
		}
	}
</style>
