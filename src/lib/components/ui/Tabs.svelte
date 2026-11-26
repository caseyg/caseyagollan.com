<script module lang="ts">
	export interface TabItem {
		/** Identifies the tab and its panel; also what `value` holds. */
		value: string;
		label: string;
		/** A small note after the label, such as a count or "Off". */
		note?: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/svelte/tabs';

	interface Props {
		tabs: TabItem[];
		/** The open tab. Supports bind:value. */
		value?: string;
		/** Names the list for assistive technology, such as "Account settings". */
		label: string;
		/**
		 * `side` sets the list in a column beside the panels wherever there is room for both, for a
		 * page of settings; `top` always sets it in a row above them.
		 */
		placement?: 'side' | 'top';
		/** Draws the panel for a tab. Panels stay in the page while hidden, so they keep their state. */
		panel: Snippet<[string]>;
		class?: string;
	}

	let { tabs, value = $bindable(tabs[0]?.value), label, placement = 'side', panel, class: className = '' }: Props = $props();

	/* Measured rather than read from the window, so a docked side panel narrowing the page counts. */
	let width = $state(0);
	const beside = $derived(placement === 'side' && width >= 640);
</script>

<div class="tabs-frame {className}" bind:clientWidth={width}>
	<Tabs class="tabs" bind:value orientation={beside ? 'vertical' : 'horizontal'}>
		<TabsList class="tabs-list" aria-label={label}>
			{#each tabs as tab (tab.value)}
				<TabsTab class="tabs-tab" value={tab.value}>{tab.label}{#if tab.note}<span class="tabs-note">{tab.note}</span>{/if}</TabsTab>
			{/each}
		</TabsList>
		<div class="tabs-panels">
			{#each tabs as tab (tab.value)}
				<TabsPanel class="tabs-panel" value={tab.value} keepMounted>{@render panel(tab.value)}</TabsPanel>
			{/each}
		</div>
	</Tabs>
</div>

<style>
	:global(.tabs) {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	:global(.tabs[data-orientation='vertical']) {
		display: grid;
		grid-template-columns: 11rem minmax(0, 1fr);
		gap: var(--space-6);
		align-items: start;
	}

	/* In-page controls are gray; the open tab is the lighter surface, never the navigation's blue. */
	:global(.tabs-list) {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--border);
	}

	:global(.tabs-list[data-orientation='vertical']) {
		position: sticky;
		top: calc(var(--sticky-top, 0px) + var(--space-5));
		flex-direction: column;
		flex-wrap: nowrap;
		padding: 0;
		border-bottom: 0;
	}

	:global(.tabs-tab) {
		display: flex;
		flex: none;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		line-height: var(--lh-snug);
		text-align: start;
		white-space: nowrap;
		cursor: pointer;
		transition: background var(--duration) var(--ease), color var(--duration) var(--ease), scale 160ms var(--ease-out);
	}

	:global(.tabs-tab:active:not([data-disabled])) {
		scale: 0.98;
	}

	:global(.tabs-tab[data-selected]) {
		background: var(--surface-3);
		color: var(--text-primary);
	}

	@media (hover: hover) {
		:global(.tabs-tab:hover:not([data-selected], [data-disabled])) {
			background: var(--surface-1);
			color: var(--text-primary);
		}
	}

	:global(.tabs-tab:focus-visible),
	:global(.tabs-panel:focus-visible) {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	:global(.tabs-tab[data-disabled]) {
		opacity: 0.5;
		cursor: default;
	}

	.tabs-note {
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
		font-variant-numeric: tabular-nums;
	}

	.tabs-panels {
		min-width: 0;
	}

	/* A panel's first section starts level with the list, without the rule that separates the rest. */
	:global(.tabs-panel > .section--rule:first-child),
	:global(.tabs-panel > :first-child > .section--rule:first-child) {
		padding-top: 0;
		border-top: 0;
	}

	@media (forced-colors: active) {
		:global(.tabs-tab[data-selected]) {
			outline: 2px solid CanvasText;
			outline-offset: -2px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.tabs-tab:active:not([data-disabled])) {
			scale: none;
		}
	}
</style>
