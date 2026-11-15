<script module lang="ts">
	import type { MenuOption } from './SelectMenu.svelte';

	export interface Segment {
		label: string;
		/** Where the segment leads. Leave out, with `onclick` or `value`, for a segment that acts on the page instead. */
		href?: string;
		/** An emoji shown before the label. */
		icon?: string;
		/** Marks the segment for the page being viewed. */
		current?: boolean;
		count?: number;
		/** Pages to switch between; the segment becomes a menu. */
		menu?: MenuOption[];
		/** Value of the menu entry for the page being viewed, when it is not the one labelled like the segment. */
		menuActive?: string;
		/** A short note after a menu segment's label, e.g. the filter in effect. */
		menuBadge?: string;
		/** Makes the segment a button, such as a control that steps through its options. */
		onclick?: () => void;
		/** Makes the segment one choice of the pill's `value`. */
		value?: string;
		/** Accessible name when it should say more than the label. */
		ariaLabel?: string;
		title?: string;
	}
</script>

<script lang="ts">
	import { Button } from '@ui-sdk/svelte/button';
	import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/svelte/segmented-control';
	import Count from './Count.svelte';
	import SelectMenu from './SelectMenu.svelte';

	interface Props {
		segments: Segment[];
		/** `sm` labels a group of posts in gray, `md` is a button group or a page's trail, `lg` is a page title. */
		size?: 'sm' | 'md' | 'lg';
		/** Accessible name for the group, e.g. "Date archive". */
		label?: string;
		/** On a phone, show emoji alone. A segment with no `icon` keeps its label. */
		compact?: boolean;
		/** `accent` is the blue of the site navigation; `quiet` is the ground colour with a gray outline, for a page's trail. */
		tone?: 'accent' | 'quiet';
		/** Square the trailing corners so a control placed right after the pill completes the group. */
		attached?: boolean;
		/** With segments that carry a `value`, the pill picks one of them, like a radio group. */
		value?: string;
		onValueChange?: (value: string) => void;
	}

	let { segments, size = 'sm', label, compact = false, tone = 'accent', attached = false, value = $bindable(), onValueChange }: Props = $props();

	const classes = $derived(`segmented-pill segmented-pill--${size} segmented-pill--${tone} ${compact ? 'compact' : ''} ${attached ? 'attached' : ''}`);
	const name = (segment: Segment) => segment.ariaLabel ?? (compact && segment.icon ? segment.label : undefined);
</script>

{#snippet content(segment: Segment)}
	{#if segment.icon}<span class="icon" aria-hidden="true">{segment.icon}</span>{/if}
	<span class="text">{segment.label}</span>
	{#if segment.count !== undefined}<span class="count"><Count value={segment.count} label="{segment.count} posts" /></span>{/if}
{/snippet}

{#if value !== undefined}
	<SegmentedControl class={classes} aria-label={label} {value} onValueChange={(next) => { if (next === null) return; value = next as string; onValueChange?.(value); }}>
		<SegmentedControlIndicator class="indicator" />
		{#each segments as segment (segment.value)}
			<SegmentedControlItem class="segment" value={segment.value ?? segment.label} aria-label={name(segment)} title={segment.title}>
				{@render content(segment)}
			</SegmentedControlItem>
		{/each}
	</SegmentedControl>
{:else}
	<span class={classes} role="group" aria-label={label}>
		{#each segments as segment (segment.href || segment.label)}
			{#if segment.menu}
				<span class="segment segment--menu" class:current={segment.current}>
					<SelectMenu variant="segment" current={segment.label} currentIcon={segment.icon} count={segment.count} options={segment.menu} active={segment.menuActive} badge={segment.menuBadge} />
				</span>
			{:else if segment.onclick}
				<Button class="segment" aria-label={name(segment)} title={segment.title} onclick={segment.onclick}>{@render content(segment)}</Button>
			{:else}
				<a href={segment.href} class="segment" class:current={segment.current} aria-current={segment.current ? 'page' : undefined} aria-label={name(segment)} title={segment.title}>{@render content(segment)}</a>
			{/if}
		{/each}
	</span>
{/if}

<style>
	/* Menus open in the top layer, so the pill can clip its segments to its corners. */
	:global(.segmented-pill) {
		position: relative;
		isolation: isolate;
		display: inline-flex;
		overflow: clip;
		border-radius: var(--radius-sm);
		background: var(--accent);
		font-weight: var(--fw-medium);
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-normal);
	}

	:global(.segmented-pill.attached) {
		border-start-end-radius: 0;
		border-end-end-radius: 0;
	}

	:global(.segmented-pill .segment) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--segment-padding);
		border: 0;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		letter-spacing: inherit;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		transition: background var(--duration) var(--ease);
	}

	:global(.segmented-pill .segment--menu) {
		padding: 0;
	}

	:global(.segmented-pill .segment + .segment) {
		box-shadow: inset 1px 0 0 var(--seg-divider, var(--segment-divider));
	}

	:global(.segmented-pill .segment:hover),
	:global(.segmented-pill .segment.current) {
		background: var(--accent-hover);
	}

	:global(.segmented-pill .segment:focus-visible) {
		outline-offset: -2px;
	}

	/* The chosen segment's fill slides between choices. */
	:global(.segmented-pill .indicator) {
		position: absolute;
		z-index: -1;
		top: var(--segmented-control-indicator-top);
		left: var(--segmented-control-indicator-left);
		width: var(--segmented-control-indicator-width);
		height: var(--segmented-control-indicator-height);
		background: var(--seg-current, var(--accent-hover));
		transition: left 200ms var(--ease-out), width 200ms var(--ease-out);
	}

	:global(.segmented-pill .segment[data-checked]),
	:global(.segmented-pill .segment[data-checked]:hover) {
		background: transparent;
	}

	/*
	 * A button group or trail. Every one is as tall as the site navigation, whatever it holds.
	 * In the accent tone segments rest lighter and the one in effect takes the full accent.
	 */
	:global(.segmented-pill--md) {
		--seg-bg: var(--segment);
		--seg-hover: var(--segment-hover);
		--seg-current: var(--segment-current);
		--seg-divider: var(--segment-divider);
		--menu-bg: var(--segment);
		--segment-padding: 0 var(--space-3);
		height: var(--nav-height);
		background: var(--seg-bg);
		font-size: var(--fs-sm);
		letter-spacing: 0.01em;
	}

	/* The quiet tone is the ground itself, outlined, so a trail reads as part of the page it names. */
	:global(.segmented-pill--md.segmented-pill--quiet) {
		--seg-bg: var(--bg-primary);
		--seg-hover: color-mix(in srgb, white 15%, var(--bg-primary));
		--seg-current: color-mix(in srgb, white 22%, var(--bg-primary));
		--seg-divider: var(--border-strong);
		--menu-bg: var(--bg-primary);
		--menu-outline: 1px solid var(--border-strong);
	}

	/* The outline is drawn over the segments, which would otherwise cover it. */
	:global(.segmented-pill--md.segmented-pill--quiet::after) {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid var(--border-strong);
		border-radius: inherit;
		pointer-events: none;
	}

	:global(.segmented-pill--md .segment) {
		height: 100%;
	}

	:global(.segmented-pill--md .segment:hover),
	:global(.segmented-pill--md .segment--menu:hover) {
		background: var(--seg-hover);
	}

	:global(.segmented-pill--md .segment--menu) {
		background: var(--seg-bg);
	}

	:global(.segmented-pill--md .segment.current),
	:global(.segmented-pill--md .segment--menu.current:hover) {
		background: var(--seg-current);
	}

	/* A small pill labels content inside the page, so it wears the grays of tags and filters. Blue is kept for the pinned navigation. */
	:global(.segmented-pill--sm) {
		--seg-current: var(--surface-3);
		--seg-divider: var(--border);
		--segment-padding: var(--space-1) var(--space-2);
		background: var(--surface-2);
		font-size: var(--fs-xs);
		letter-spacing: 0.02em;
	}

	:global(.segmented-pill--sm .segment:hover),
	:global(.segmented-pill--sm .segment.current) {
		background: var(--surface-3);
	}

	:global(.segmented-pill--lg) {
		--segment-padding: var(--space-2) var(--space-4);
		font-size: var(--fs-lg);
	}

	:global(.segmented-pill .count) {
		display: inline-flex;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.segmented-pill .indicator) {
			transition: none;
		}
	}

	/* On a phone a compact group shows emoji alone. A segment with no emoji keeps its label, set tighter. */
	@media (max-width: 600px) {
		:global(.segmented-pill.compact) {
			--segment-padding: 0 var(--space-2);
		}

		/* Direct children only: a menu opened from a segment keeps its own sizes and counts. */
		:global(.segmented-pill.compact .segment > .icon) {
			font-size: var(--fs-lg);
		}

		:global(.segmented-pill.compact .segment:has(> .icon)) {
			padding-inline: 0.625rem;
		}

		:global(.segmented-pill.compact .segment:has(> .icon) .text),
		:global(.segmented-pill.compact .segment > .count) {
			display: none;
		}
	}
</style>
