<script module lang="ts">
	export interface Segment {
		label: string;
		href: string;
		/** Marks the segment for the page being viewed. */
		current?: boolean;
		count?: number;
	}
</script>

<script lang="ts">
	import Count from './Count.svelte';

	interface Props {
		segments: Segment[];
		size?: 'sm' | 'lg';
		/** Accessible name for the group, e.g. "Date archive". */
		label?: string;
	}

	let { segments, size = 'sm', label }: Props = $props();
</script>

<span class="pill pill--{size}" role="group" aria-label={label}>
	{#each segments as segment (segment.href)}
		<a href={segment.href} class="segment" class:current={segment.current} aria-current={segment.current ? 'true' : undefined}>
			{segment.label}{#if segment.count !== undefined}<Count value={segment.count} label="{segment.count} posts" />{/if}
		</a>
	{/each}
</span>

<style>
	.pill {
		display: inline-flex;
		overflow: hidden;
		border-radius: var(--radius-sm);
		background: var(--accent);
		font-weight: var(--fw-medium);
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-normal);
	}

	.segment {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-primary);
		text-decoration: none;
		transition: background var(--duration) var(--ease);
	}

	.segment + .segment {
		box-shadow: inset 1px 0 0 rgb(255 255 255 / 0.3);
	}

	.segment:hover,
	.segment.current {
		background: var(--accent-hover);
	}

	.segment:focus-visible {
		outline-offset: -2px;
	}

	.pill--sm {
		font-size: var(--fs-xs);
		letter-spacing: 0.02em;
	}

	.pill--sm .segment {
		padding: var(--space-1) var(--space-2);
	}

	.pill--lg {
		font-size: var(--fs-lg);
	}

	.pill--lg .segment {
		padding: var(--space-2) var(--space-4);
	}
</style>
