<script module lang="ts">
	export interface MenuOption {
		value: string;
		label: string;
		href: string;
		count?: number;
		icon?: string;
		/** Options that share a group sit together under it as a heading. */
		group?: string;
		/**
		 * Makes the option a filter that can be combined with others: it shows a check box, its link
		 * changes the page in place, and the menu stays open for the next choice.
		 */
		checked?: boolean;
	}

	/*
	 * Choosing a filter can lead to another route, or to a full page load after a deploy, and either
	 * builds a new menu. The menu of filters stays open until it is closed on purpose, so remember
	 * that here and, for a full load, in the session for a few seconds.
	 */
	const STICKY_KEY = 'select-menu-open';
	let sticky = false;

	function setSticky(value: boolean) {
		sticky = value;
		try {
			if (value) sessionStorage.setItem(STICKY_KEY, String(Date.now()));
			else sessionStorage.removeItem(STICKY_KEY);
		} catch {
			// Storage can be unavailable; the menu then only stays open within the page.
		}
	}

	function wasSticky(): boolean {
		if (sticky) return true;
		try {
			return Date.now() - Number(sessionStorage.getItem(STICKY_KEY) ?? 0) < 10_000;
		} catch {
			return false;
		}
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Count from './Count.svelte';
	import Popover from './Popover.svelte';

	interface Props {
		/** Label of the selected option, shown on the trigger. */
		current: string;
		currentIcon?: string;
		count?: number;
		options: MenuOption[];
		/** Value of the option for the page being viewed. Defaults to the option labelled like `current`. */
		active?: string;
		/** A short note after the label, e.g. the filter in effect. */
		badge?: string;
		/** Render the trigger as a segment of a `SegmentedPill`, taking its size and colours from the pill. */
		segment?: boolean;
	}

	let { current, currentIcon, count, options, active, badge, segment = false }: Props = $props();

	const isActive = (option: MenuOption) => (active === undefined ? option.label === current : option.value === active);
	const filters = $derived(options.some((option) => option.checked !== undefined));

	// svelte-ignore state_referenced_locally
	let open = $state(filters && sticky);
	onMount(() => {
		if (filters && wasSticky()) {
			sticky = true;
			open = true;
		}
	});
	// Closing the menu, by any means, ends it.
	$effect(() => {
		if (filters && !open && sticky) setSticky(false);
	});

	// Without JavaScript a filter is a plain link; with it, keep the scroll position and the menu.
	function onFilterClick(event: MouseEvent, option: MenuOption) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		setSticky(true);
		void goto(option.href, { noScroll: true, keepFocus: true });
	}
</script>

<Popover bind:open class="select-menu {segment ? 'segment' : ''}" triggerClass="trigger" panelClass="menu">
	{#snippet trigger(open)}
		<span class="current" class:has-icon={currentIcon} title={current}>{#if currentIcon}<span class="icon" aria-hidden="true">{currentIcon}</span>{/if}<span class="text">{current}</span></span>
		{#if badge}<span class="badge">{badge}</span>{/if}
		{#if count !== undefined}<span class="count"><Count value={count} label="{count} posts" /></span>{/if}
		<span class="arrow" class:open aria-hidden="true">▾</span>
	{/snippet}
	<ul>
		{#each options as option, i (option.value)}
			{#if option.group && option.group !== options[i - 1]?.group}<li class="group" role="presentation">{option.group}</li>{/if}
			<li>
				{#if option.checked !== undefined}
					<a href={option.href} class="item" data-keep-open data-sveltekit-noscroll onclick={(event) => onFilterClick(event, option)}>
						<span><span class="check" class:on={option.checked} aria-hidden="true">{option.checked ? '✓' : ''}</span>{#if option.icon}<span class="icon" aria-hidden="true">{option.icon}</span>{/if}{option.label}<span class="visually-hidden">{option.checked ? ', selected' : ''}</span></span>
						{#if option.count !== undefined}<Count value={option.count} />{/if}
					</a>
				{:else}
				<a
					href={option.href}
					class="item"
					class:active={isActive(option)}
					aria-current={isActive(option) ? 'page' : undefined}
				>
					<span>{#if option.icon}<span class="icon" aria-hidden="true">{option.icon}</span>{/if}{option.label}</span>
					{#if option.count !== undefined}<Count value={option.count} />{/if}
				</a>
				{/if}
			</li>
		{/each}
	</ul>
</Popover>

<style>
	:global(.select-menu .trigger) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		cursor: pointer;
		transition: background var(--duration) var(--ease);
	}

	:global(.select-menu .trigger:hover),
	:global(.select-menu .trigger[aria-expanded='true']) {
		background: var(--accent-hover);
	}

	/* Inside a segmented pill the trigger is one more segment, as tall as its neighbours. */
	:global(.select-menu.segment),
	:global(.select-menu.segment .trigger) {
		height: 100%;
	}

	:global(.select-menu.segment .trigger) {
		padding: var(--segment-padding, var(--space-1) var(--space-3));
		border-radius: 0;
		background: none;
		font-size: inherit;
		font-weight: inherit;
		line-height: inherit;
		letter-spacing: inherit;
	}

	:global(.select-menu.segment .trigger:hover),
	:global(.select-menu.segment .trigger[aria-expanded='true']) {
		background: var(--seg-hover, var(--segment-hover));
	}

	:global(.select-menu.segment .trigger:focus-visible) {
		outline-offset: -2px;
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

	.badge {
		color: var(--text-secondary);
		font-weight: var(--fw-regular);
		white-space: nowrap;
	}

	.check {
		display: inline-grid;
		place-items: center;
		width: 1.1em;
		height: 1.1em;
		margin-right: var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: 3px;
		font-size: var(--fs-xs);
		line-height: 1;
		vertical-align: -0.1em;
	}

	.check.on {
		border-color: var(--text-primary);
		background: var(--text-primary);
		color: var(--bg-primary);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.arrow {
		font-size: var(--fs-sm);
		transition: transform var(--duration) var(--ease);
	}

	.arrow.open {
		transform: rotate(180deg);
	}

	.item .icon {
		margin-right: var(--space-2);
	}

	/* A compact pill shows emoji alone on a phone; a label with no emoji stays, kept short. */
	@media (max-width: 600px) {
		:global(.pill.compact) .current.has-icon .text,
		:global(.pill.compact) .count {
			display: none;
		}

		:global(.pill.compact) .current .icon {
			font-size: var(--fs-lg);
		}

		:global(.pill.compact) .text {
			max-width: 26vw;
		}

		:global(.pill.compact) .arrow {
			font-size: var(--fs-xs);
		}
	}

	:global(.select-menu .menu) {
		min-width: 12rem;
		max-height: 75vh;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
		border-radius: var(--radius-sm);
		background: var(--menu-bg, var(--segment));
		outline: var(--menu-outline, none);
		outline-offset: -1px;
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
		scrollbar-width: thin;
		/* Grow out of the trigger it belongs to. */
		transform-origin: top left;
		transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
	}

	@starting-style {
		:global(.select-menu .menu) {
			opacity: 0;
			transform: scale(0.97);
		}
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.group {
		padding: var(--space-3) var(--space-4) var(--space-1);
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		color: var(--text-primary);
		font-size: var(--fs-base);
		font-weight: var(--fw-regular);
		line-height: var(--lh-normal);
		letter-spacing: 0;
		text-decoration: none;
		white-space: nowrap;
		transition: background var(--duration) var(--ease);
	}

	.item:hover {
		background: var(--seg-hover, var(--segment-hover));
	}

	/* The page being viewed is marked as the current segment of a trail is. */
	.item.active {
		background: var(--seg-current, var(--segment-current));
	}

	.item:focus-visible {
		outline-offset: -2px;
	}
</style>
