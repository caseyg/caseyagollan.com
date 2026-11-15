<script module lang="ts">
	export interface MenuOption {
		value: string;
		label: string;
		href: string;
		count?: number;
		icon?: string;
		/** Options that share a group sit together under it as a heading. */
		group?: string;
		/** Tooltip, such as what a post type is for. */
		title?: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuTrigger } from '@ui-sdk/svelte/menu';
	import Count from './Count.svelte';

	interface Props {
		/** Label of the selected option, shown on the trigger. */
		current: string;
		currentIcon?: string;
		count?: number;
		options: MenuOption[];
		/** Value of the option for the page being viewed. Defaults to the option labelled like `current`. */
		active?: string;
		/**
		 * `title` is a page title on the accent, `segment` a segment of a `SegmentedPill` that takes its
		 * size and colours from the pill, `quiet` a low-emphasis control in a toolbar such as the composer's.
		 */
		variant?: 'title' | 'segment' | 'quiet';
		/** Accessible name for the trigger when it should say more than `current`. */
		label?: string;
		/** Draws an option's icon, in place of its emoji. */
		icon?: Snippet<[option: MenuOption]>;
		/** Load each option with a full page request, for pages whose form must start from the server. */
		reload?: boolean;
		align?: 'start' | 'end';
		/** Lay a long list of short options out in two columns. */
		columns?: 1 | 2;
	}

	let { current, currentIcon, count, options, active, variant = 'title', label, icon, reload = false, align = 'start', columns = 1 }: Props = $props();

	const isActive = (option: MenuOption) => (active === undefined ? option.label === current : option.value === active);
	const selected = $derived(options.find(isActive));

	// Consecutive options with the same group share one heading.
	const groups = $derived(
		options.reduce<{ label?: string; options: MenuOption[] }[]>((all, option) => {
			const last = all.at(-1);
			if (last && last.label === option.group) last.options.push(option);
			else all.push({ label: option.group, options: [option] });
			return all;
		}, [])
	);
</script>

{#snippet item(option: MenuOption)}
	{@const on = isActive(option)}
	<MenuItem class="select-menu-item" label={option.label}>
		{#snippet render({ props })}
			<a {...props} href={option.href} aria-current={on ? 'page' : undefined} data-active={on || undefined} title={option.title} data-sveltekit-reload={reload || undefined}>
				{#if icon}{@render icon(option)}{:else if option.icon}<span class="icon" aria-hidden="true">{option.icon}</span>{/if}
				<span class="label">{option.label}</span>
				{#if option.count !== undefined}<Count value={option.count} />{/if}
			</a>
		{/snippet}
	</MenuItem>
{/snippet}

<Menu>
	<MenuTrigger class="select-menu-trigger select-menu-trigger--{variant}" aria-label={label}>
		<span class="current" class:has-icon={currentIcon || icon} title={current}>
			{#if icon && selected}{@render icon(selected)}{:else if currentIcon}<span class="icon" aria-hidden="true">{currentIcon}</span>{/if}
			<span class="text">{current}</span>
		</span>
		{#if count !== undefined}<span class="count"><Count value={count} label="{count} posts" /></span>{/if}
		<span class="arrow" aria-hidden="true">▾</span>
	</MenuTrigger>
	<MenuContent class="select-menu select-menu--{variant} {columns === 2 ? 'select-menu--columns' : ''}" side="bottom" {align} sideOffset={4} collisionPadding={8}>
		{#each groups as group, i (group.label ?? i)}
			{#if group.label}
				<MenuGroup class="select-menu-group">
					<MenuGroupLabel class="select-menu-group-label">{group.label}</MenuGroupLabel>
					{#each group.options as option (option.value)}{@render item(option)}{/each}
				</MenuGroup>
			{:else}
				{#each group.options as option (option.value)}{@render item(option)}{/each}
			{/if}
		{/each}
	</MenuContent>
</Menu>

<style>
	:global(.select-menu-trigger) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		border: 0;
		color: var(--text-primary);
		font: inherit;
		cursor: pointer;
		transition: background var(--duration) var(--ease);
	}

	:global(.select-menu-trigger--title) {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--accent);
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
	}

	:global(.select-menu-trigger--title:hover),
	:global(.select-menu-trigger--title[data-open]) {
		background: var(--accent-hover);
	}

	/* Inside a segmented pill the trigger is one more segment, as tall as its neighbours. */
	:global(.select-menu-trigger--segment) {
		height: 100%;
		padding: var(--segment-padding, var(--space-1) var(--space-3));
		border-radius: 0;
		background: none;
		font-size: inherit;
		font-weight: inherit;
		line-height: inherit;
		letter-spacing: inherit;
	}

	:global(.select-menu-trigger--segment:hover),
	:global(.select-menu-trigger--segment[data-open]) {
		background: var(--seg-hover, var(--segment-hover));
	}

	:global(.select-menu-trigger--segment:focus-visible) {
		outline-offset: -2px;
	}

	:global(.select-menu-trigger--quiet) {
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		background: transparent;
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		line-height: var(--lh-snug);
	}

	:global(.select-menu-trigger--quiet:hover),
	:global(.select-menu-trigger--quiet[data-open]) {
		background: var(--surface-2);
	}

	.current {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.text {
		max-width: min(16rem, 40vw);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.count {
		display: inline-flex;
	}

	.arrow {
		font-size: var(--fs-sm);
		transition: transform var(--duration) var(--ease);
	}

	:global([data-open]) > .arrow {
		transform: rotate(180deg);
	}

	/* A compact pill shows emoji alone on a phone; a label with no emoji stays, kept short. */
	@media (max-width: 600px) {
		:global(.segmented-pill.compact) .current.has-icon .text,
		:global(.segmented-pill.compact) .count {
			display: none;
		}

		:global(.segmented-pill.compact) .current .icon {
			font-size: var(--fs-lg);
		}

		:global(.segmented-pill.compact) .text {
			max-width: 26vw;
		}

		:global(.segmented-pill.compact) .arrow {
			font-size: var(--fs-xs);
		}
	}

	:global(.select-menu) {
		box-sizing: border-box;
		min-width: max(12rem, var(--anchor-width));
		max-height: min(75vh, var(--available-height));
		margin: 0;
		padding: 0;
		overflow-y: auto;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--menu-bg, var(--segment));
		color: var(--text-primary);
		outline: var(--menu-outline, none);
		outline-offset: -1px;
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
		scrollbar-width: thin;
		/* Grow out of the trigger it belongs to. */
		transform-origin: var(--transform-origin);
		transition: opacity 150ms var(--ease-out), scale 150ms var(--ease-out);
	}

	/* Outside the pinned navigation a menu sits on the page's own ground. */
	:global(.select-menu--quiet) {
		padding: var(--space-1);
		border: 1px solid var(--border);
		background: var(--bg-primary);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
	}

	:global(.select-menu--columns) {
		display: grid;
		grid-template-columns: repeat(2, minmax(8.5rem, 1fr));
	}

	:global(.select-menu[data-starting-style]),
	:global(.select-menu[data-ending-style]) {
		opacity: 0;
		scale: 0.97;
	}

	:global(.select-menu-group-label) {
		padding: var(--space-3) var(--space-4) var(--space-1);
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	:global(.select-menu-item) {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		color: var(--text-primary);
		font-size: var(--fs-base);
		font-weight: var(--fw-regular);
		line-height: var(--lh-normal);
		letter-spacing: 0;
		text-decoration: none;
		white-space: nowrap;
		outline: none;
		transition: background var(--duration) var(--ease);
	}

	:global(.select-menu-item[data-highlighted]) {
		background: var(--seg-hover, var(--segment-hover));
	}

	/* The page being viewed is marked as the current segment of a trail is. */
	:global(.select-menu-item[data-active]) {
		background: var(--seg-current, var(--segment-current));
	}

	:global(.select-menu--quiet .select-menu-item) {
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	:global(.select-menu--quiet .select-menu-item[data-highlighted]),
	:global(.select-menu--quiet .select-menu-item[data-active]) {
		background: var(--surface-2);
	}

	.label {
		flex: 1;
		min-width: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.select-menu) {
			transition: none;
		}
	}
</style>
