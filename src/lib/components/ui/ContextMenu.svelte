<script module lang="ts">
	export interface ContextMenuItem {
		value: string;
		label: string;
		/** A second line, such as what the action affects. */
		hint?: string;
		destructive?: boolean;
		disabled?: boolean;
	}

	export interface ContextMenuPoint {
		x: number;
		y: number;
	}
</script>

<script lang="ts">
	import { createMenuController, Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator } from '@ui-sdk/svelte/menu';

	interface Props {
		items: ContextMenuItem[];
		/** Names what was right-clicked, as the menu's heading. */
		title?: string;
		onAction: (value: string) => unknown;
	}

	let { items, title, onAction }: Props = $props();

	const menu = createMenuController();
	const safe = $derived(items.filter((item) => !item.destructive));
	const destructive = $derived(items.filter((item) => item.destructive));

	/** Opens the menu at a point in the viewport, such as a right-click's `clientX`/`clientY`. */
	export function openAt(point: ContextMenuPoint) {
		return menu.open({ anchor: { x: point.x, y: point.y }, focus: 'first' });
	}

	export function close() {
		menu.close();
	}
</script>

{#snippet row(item: ContextMenuItem)}
	<MenuItem class="context-menu-item" value={item.value} label={item.label} disabled={item.disabled} destructive={item.destructive}>
		<span class="context-menu-label">{item.label}</span>
		{#if item.hint}<span class="context-menu-hint">{item.hint}</span>{/if}
	</MenuItem>
{/snippet}

<Menu controller={menu} onAction={(value) => onAction(value)}>
	<MenuContent class="context-menu" side="bottom" align="start" sideOffset={2} collisionPadding={8} finalFocus="none">
		<MenuGroup>
			{#if title}<MenuGroupLabel class="context-menu-title">{title}</MenuGroupLabel>{/if}
			{#each safe as item (item.value)}{@render row(item)}{/each}
		</MenuGroup>
		{#if destructive.length}
			{#if safe.length}<MenuSeparator class="context-menu-separator" />{/if}
			{#each destructive as item (item.value)}{@render row(item)}{/each}
		{/if}
	</MenuContent>
</Menu>

<style>
	:global(.context-menu) {
		box-sizing: border-box;
		min-width: 14rem;
		max-width: min(22rem, calc(100vw - 2 * var(--space-4)));
		max-height: min(75vh, var(--available-height));
		margin: 0;
		padding: var(--space-1);
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: var(--fs-base);
		line-height: var(--lh-normal);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
		transform-origin: var(--transform-origin);
		transition: opacity 120ms var(--ease-out), scale 120ms var(--ease-out);
	}

	:global(.context-menu[data-starting-style]),
	:global(.context-menu[data-ending-style]) {
		opacity: 0;
		scale: 0.97;
	}

	:global(.context-menu-title) {
		padding: var(--space-2) var(--space-2) var(--space-1);
		overflow: hidden;
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		letter-spacing: 0.04em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	:global(.context-menu-item) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		outline: none;
		cursor: default;
		transition: background var(--duration) var(--ease);
	}

	:global(.context-menu-item[data-highlighted]) {
		background: var(--surface-2);
	}

	:global(.context-menu-item[data-disabled]) {
		opacity: 0.5;
	}

	:global(.context-menu-item[data-pending]) {
		opacity: 0.7;
		cursor: progress;
	}

	.context-menu-hint {
		overflow: hidden;
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.context-menu-separator) {
		height: 1px;
		margin: var(--space-1) 0;
		background: var(--border);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.context-menu) {
			transition: none;
		}
	}
</style>
