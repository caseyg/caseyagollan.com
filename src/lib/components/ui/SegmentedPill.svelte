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
		/** Pages to switch between; the segment becomes a menu. */
		menu?: MenuOption[];
		/** Value of the menu entry for the page being viewed, when it is not the one labelled like the segment. */
		menuActive?: string;
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
		/** On a phone, show emoji alone. A segment with no `icon` keeps its label. */
		compact?: boolean;
		/** `accent` is the blue of the site navigation; `quiet` is the ground colour with a gray outline, for a page's trail. */
		tone?: 'accent' | 'quiet';
		/** Square the trailing corners so a control placed right after the pill completes the group. */
		attached?: boolean;
	}

	let { segments, size = 'sm', label, compact = false, tone = 'accent', attached = false }: Props = $props();
</script>

<span class="pill pill--{size} pill--{tone}" class:compact class:attached role="group" aria-label={label}>
	{#each segments as segment (segment.href || segment.label)}
		{#if segment.menu}
			<span class="segment segment--menu" class:current={segment.current}>
				<SelectMenu segment current={segment.label} currentIcon={segment.icon} count={segment.count} options={segment.menu} active={segment.menuActive} />
			</span>
		{:else if segment.onclick}
			<button type="button" class="segment" class:current={segment.pressed} aria-pressed={segment.pressed} aria-label={segment.ariaLabel ?? (compact ? segment.label : undefined)} title={segment.title} onclick={segment.onclick}>
				{#if segment.icon}<span class="icon" aria-hidden="true">{segment.icon}</span>{/if}
				<span class="text">{segment.label}</span>
			</button>
		{:else}
			<a href={segment.href} class="segment" class:current={segment.current} aria-current={segment.current ? 'page' : undefined} aria-label={segment.ariaLabel ?? (compact ? segment.label : undefined)} title={segment.title}>
				{#if segment.icon}<span class="icon" aria-hidden="true">{segment.icon}</span>{/if}
				<span class="text">{segment.label}</span>{#if segment.count !== undefined}<span class="count"><Count value={segment.count} label="{segment.count} posts" /></span>{/if}
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
		background: transparent;
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

	/*
	 * A button group or trail. Every one is as tall as the site navigation, whatever it holds.
	 * In the accent tone segments rest lighter and the one in effect takes the full accent.
	 */
	.pill--md {
		--seg-bg: var(--segment);
		--seg-hover: var(--segment-hover);
		--seg-current: var(--segment-current);
		--seg-divider: var(--segment-divider);
		--menu-bg: var(--segment);
		height: var(--nav-height);
		background: none;
	}

	/* The quiet tone is the ground itself, outlined, so a trail reads as part of the page it names. */
	.pill--md.pill--quiet {
		--seg-bg: var(--bg-primary);
		--seg-hover: color-mix(in srgb, white 15%, var(--bg-primary));
		--seg-current: color-mix(in srgb, white 22%, var(--bg-primary));
		--seg-divider: var(--border-strong);
		--menu-bg: var(--bg-primary);
		--menu-outline: 1px solid var(--border-strong);
		position: relative;
	}

	/* The outline is drawn over the segments, which would otherwise cover it. */
	.pill--md.pill--quiet::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid var(--border-strong);
		border-radius: inherit;
		pointer-events: none;
	}

	.pill--md .segment {
		height: 100%;
		background: var(--seg-bg);
	}

	.pill--md .segment + .segment {
		box-shadow: inset 1px 0 0 var(--seg-divider);
	}

	.pill--md .segment:hover {
		background: var(--seg-hover);
	}

	.pill--md .segment.current {
		background: var(--seg-current);
	}

	.pill--md .segment--menu:hover {
		background: var(--seg-bg);
	}

	.pill--md .segment--menu.current:hover {
		background: var(--seg-current);
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
		--segment-padding: 0 var(--space-3);
		font-size: var(--fs-sm);
		letter-spacing: 0.01em;
	}

	.count {
		display: inline-flex;
	}

	.pill--lg {
		--segment-padding: var(--space-2) var(--space-4);
		font-size: var(--fs-lg);
	}

	/* On a phone a compact group shows emoji alone. A segment with no emoji keeps its label, set tighter. */
	@media (max-width: 600px) {
		.compact {
			--segment-padding: 0 var(--space-2);
		}

		.compact .icon {
			font-size: var(--fs-lg);
		}

		.compact .segment:has(> .icon) {
			padding-inline: 0.625rem;
		}

		.compact .segment:has(> .icon) .text,
		.compact .count {
			display: none;
		}
	}
</style>
