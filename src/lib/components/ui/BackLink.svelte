<script lang="ts">
	import type { Snippet } from 'svelte';

	let { href, children }: { href: string; children: Snippet } = $props();
</script>

<a {href} class="back-link"><span class="arrow" aria-hidden="true">←</span>{@render children()}</a>

<style>
	.back-link {
		display: flex;
		align-items: baseline;
		gap: 0.4em;
		width: fit-content;
		margin-left: calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		text-decoration: none;
		transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
	}

	.back-link:hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.arrow {
		transition: transform var(--duration) var(--ease);
	}

	.back-link:hover .arrow {
		transform: translateX(-2px);
	}
</style>
