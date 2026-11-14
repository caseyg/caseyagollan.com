<script module lang="ts">
	import type { MenuOption } from './SelectMenu.svelte';

	export interface Segment {
		label: string;
		/** Where the segment leads. Leave out, with `onclick`, for a segment that acts on the page instead. */
		href?: string;
		/** An emoji shown before the label. */
		icon?: string;
		/** Marks the segment for the page being viewed. */
		current?: boolean;
		count?: number;
		/** Sibling pages to switch between; the segment becomes a menu. */
		menu?: MenuOption[];
		/** Makes the segment a button. */
		onclick?: () => void;
		/** For a button that is one of several choices: whether it is the one in effect. */
		pressed?: boolean;
		/** Accessible name when it should say more than the label. */
		ariaLabel?: string;
		title?: string;
	}
</script>

<script lang="ts">
	import Count from './Count.svelte';
	import SelectMenu from './SelectMenu.svelte';

	interface Props {
		segments: Segment[];
		/** `sm` labels a group of posts in gray, `md` is a button group or a page's trail, `lg` is a page title. */
		size?: 'sm' | 'md' | 'lg';
		/** Accessible name for the group, e.g. "Date archive". */
		label?: string;
		/** On a phone, show emoji alone at a larger touch size. Every segment needs an `icon`. */
		compact?: boolean;
		/** Square the trailing corners so a control placed right after the pill completes the group. */
		attached?: boolean;
	}

	let { segments, size = 'sm', label, compact = false, attached = false }: Props = $props();
</script>

<span class="pill pill--{size}" class:compact class:attached role="group" aria-label={label}>
	{#each segments as segment (segment.href || segment.label)}
		{#if segment.menu}
			<span class="segment segment--menu">
				<SelectMenu segment current={segment.label} currentIcon={segment.icon} count={segment.count} options={segment.menu} />
			</span>
		{:else if segment.onclick}
			<button type="button" class="segment" class:current={segment.pressed} aria-pressed={segment.pressed} aria-label={segment.ariaLabel ?? (compact ? segment.label : undefined)} title={segment.title} onclick={segment.onclick}>
				{#if segment.icon}<span aria-hidden="true">{segment.icon}</span>{/if}
				<span class="text">{segment.label}</span>
			</button>
		{:else}
			<a href={segment.href} class="segment" class:current={segment.current} aria-current={segment.current ? 'page' : undefined} aria-label={segment.ariaLabel ?? (compact ? segment.label : undefined)} title={segment.title}>
				{#if segment.icon}<span aria-hidden="true">{segment.icon}</span>{/if}
				<span class="text">{segment.label}</span>{#if segment.count !== undefined}<Count value={segment.count} label="{segment.count} posts" />{/if}
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

	button.segment {
		border: 0;
		font: inherit;
		letter-spacing: inherit;
		cursor: pointer;
	}

	/* The pill cannot clip its corners, or a segment's menu would be cut off with them. */
	.segment:first-child,
	.segment:first-child :global(.trigger) {
		border-top-left-radius: var(--radius-sm);
		border-bottom-left-radius: var(--radius-sm);
	}

	.pill:not(.attached) .segment:last-child,
	.pill:not(.attached) .segment:last-child :global(.trigger) {
		border-top-right-radius: var(--radius-sm);
		border-bottom-right-radius: var(--radius-sm);
	}

	.segment--menu {
		padding: 0;
	}

	.segment + .segment {
		box-shadow: inset 1px 0 0 var(--segment-divider);
	}

	.segment:hover,
	.segment.current {
		background: var(--accent-hover);
	}

	.segment:focus-visible {
		outline-offset: -2px;
	}

	/* A button group or trail: segments rest lighter and the one in effect takes the full accent. */
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

	/* On a phone a compact group shows its emoji alone, as tall as the site navigation. */
	@media (max-width: 600px) {
		.compact {
			font-size: var(--fs-lg);
		}

		.compact .segment {
			height: var(--nav-height);
			padding-block: 0;
		}

		.compact .text {
			display: none;
		}
	}
</style>
