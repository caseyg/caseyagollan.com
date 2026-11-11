<script lang="ts">
	import type { Snippet } from 'svelte';
	import Heading from './Heading.svelte';

	interface Props {
		title: string;
		level?: 2 | 3;
		/** `rule` separates stacked sections with a hairline; `card` boxes one option among several. */
		variant?: 'rule' | 'card';
		children: Snippet;
	}

	let { title, level = 2, variant = 'rule', children }: Props = $props();

	const id = $props.id();
</script>

<section class="section section--{variant}" aria-labelledby={id}>
	<Heading {level} size={level === 2 ? 'section' : 'subtitle'} {id}>{title}</Heading>
	{@render children()}
</section>

<style>
	.section--rule {
		padding: var(--space-5) 0 var(--space-6);
		border-top: 1px solid var(--border);
	}

	.section--card {
		margin: var(--space-5) 0;
		padding: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}

	.section > :global(.heading) {
		margin-bottom: var(--space-3);
	}

	.section > :global(p) {
		margin: var(--space-2) 0;
	}
</style>
