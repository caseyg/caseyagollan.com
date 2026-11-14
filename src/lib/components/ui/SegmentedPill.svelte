<script module lang="ts">
	import type { MenuOption } from './SelectMenu.svelte';

	export interface Segment {
		label: string;
		href: string;
		/** An emoji shown before the label. */
		icon?: string;
		/** Marks the segment for the page being viewed. */
		current?: boolean;
		count?: number;
		/** Sibling pages to switch between; the segment becomes a menu. */
		menu?: MenuOption[];
	}
</script>

<script lang="ts">
	import Count from './Count.svelte';
	import SelectMenu from './SelectMenu.svelte';

	interface Props {
		segments: Segment[];
		/** `sm` labels a group of posts in gray, `md` is a page's trail, `lg` is a page title. */
		size?: 'sm' | 'md' | 'lg';
		/** Accessible name for the group, e.g. "Date archive". */
		label?: string;
	}

	let { segments, size = 'sm', label }: Props = $props();
</script>

<span class="pill pill--{size}" role="group" aria-label={label}>
	{#each segments as segment (segment.href)}
		{#if segment.menu}
			<span class="segment segment--menu">
				<SelectMenu segment current={segment.label} currentIcon={segment.icon} count={segment.count} options={segment.menu} />
			</span>
		{:else}
			<a href={segment.href} class="segment" class:current={segment.current} aria-current={segment.current ? 'page' : undefined}>
				{#if segment.icon}<span aria-hidden="true">{segment.icon}</span>{/if}
				{segment.label}{#if segment.count !== undefined}<Count value={segment.count} label="{segment.count} posts" />{/if}
			</a>
		{/if}
	{/each}
</span>

<style>
	.pill {
		display: inline-flex;
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
		padding: var(--segment-padding);
		color: var(--text-primary);
		text-decoration: none;
		white-space: nowrap;
		transition: background var(--duration) var(--ease);
	}

	/* The pill cannot clip its corners, or a segment's menu would be cut off with them. */
	.segment:first-child,
	.segment:first-child :global(.trigger) {
		border-top-left-radius: var(--radius-sm);
		border-bottom-left-radius: var(--radius-sm);
	}

	.segment:last-child,
	.segment:last-child :global(.trigger) {
		border-top-right-radius: var(--radius-sm);
		border-bottom-right-radius: var(--radius-sm);
	}

	.segment--menu {
		padding: 0;
	}

	.segment + .segment {
		box-shadow: inset 1px 0 0 var(--segment-divider);
	}

	/* A trail is a button group: segments rest lighter and the page being viewed takes the full accent. */
	.pill--md {
		background: none;
	}

	.pill--md .segment {
		background: var(--segment);
	}

	.pill--md .segment:hover {
		background: var(--segment-hover);
	}

	.pill--md .segment.current,
	.pill--md .segment--menu {
		background: var(--segment-current);
	}

	.segment:hover,
	.segment.current {
		background: var(--accent-hover);
	}

	.segment:focus-visible {
		outline-offset: -2px;
	}

	.pill--sm {
		--segment-padding: var(--space-1) var(--space-2);
		font-size: var(--fs-xs);
		letter-spacing: 0.02em;
	}

	/* A small pill labels content inside the page, so it wears the grays of tags and filters. Blue is kept for the pinned navigation. */
	.pill--sm {
		background: var(--surface-2);
	}

	.pill--sm .segment + .segment {
		box-shadow: inset 1px 0 0 var(--border);
	}

	.pill--sm .segment:hover,
	.pill--sm .segment.current {
		background: var(--surface-3);
	}

	.pill--md {
		--segment-padding: var(--space-1) var(--space-3);
		font-size: var(--fs-sm);
		letter-spacing: 0.01em;
	}

	.pill--lg {
		--segment-padding: var(--space-2) var(--space-4);
		font-size: var(--fs-lg);
	}
</style>
