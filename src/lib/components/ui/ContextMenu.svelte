<script module lang="ts">
	import type { IconName } from './Icon.svelte';

	export interface ContextMenuItem {
		value: string;
		label: string;
		/** A second line, such as what the action affects. */
		hint?: string;
		destructive?: boolean;
		disabled?: boolean;
		icon?: IconName;
		/** Items that share a group sit together, after a separator; the first ungrouped ones come under the title. */
		group?: string;
		/** A switch that is on (or the choice in effect): the row ends in a check. `false` keeps the room for one. */
		checked?: boolean;
		/** The key that does the same, shown as a hint at the end of the row. */
		shortcut?: string;
		/** Makes the item open a second menu beside it, of these. */
		items?: ContextMenuItem[];
	}

	export interface ContextMenuPoint {
		x: number;
		y: number;
	}
</script>

<script lang="ts">
	import { createMenuController, Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuItemIcon, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from '@ui-sdk/svelte/menu';
	import Icon from './Icon.svelte';

	interface Props {
		items: ContextMenuItem[];
		/** Names what was right-clicked, as the menu's heading. */
		title?: string;
		onAction: (value: string) => unknown;
	}

	let { items, title, onAction }: Props = $props();

	const menu = createMenuController();
	const safe = $derived(items.filter((item) => !item.destructive));
	/** The safe items by group, in the order the groups first appear. */
	const groups = $derived.by(() => {
		const all: { name: string; items: ContextMenuItem[] }[] = [];
		for (const item of safe) {
			const name = item.group ?? '';
			const group = all.find((one) => one.name === name);
			if (group) group.items.push(item); else all.push({ name, items: [item] });
		}
		return all.length ? all : [{ name: '', items: [] }];
	});
	const destructive = $derived(items.filter((item) => item.destructive));
	const icons = $derived(items.some((item) => item.icon));

	/** Opens the menu at a point in the viewport, such as a right-click's `clientX`/`clientY`. */
	export function openAt(point: ContextMenuPoint) {
		return menu.open({ anchor: { x: point.x, y: point.y }, focus: 'first' });
	}

	export function close() {
		menu.close();
	}
</script>

{#snippet face(item: ContextMenuItem, icons: boolean)}
	{#if icons}<MenuItemIcon class="context-menu-icon">{#if item.icon}<Icon name={item.icon} size={16} />{/if}</MenuItemIcon>{/if}
	<span class="context-menu-text">
		<span class="context-menu-label">{item.label}</span>
		{#if item.hint}<span class="context-menu-hint">{item.hint}</span>{/if}
	</span>
{/snippet}

{#snippet row(item: ContextMenuItem, icons: boolean)}
	{#if item.items}
		{@const inner = item.items}
		{@const innerIcons = inner.some((one) => one.icon)}
		<MenuSub>
			<MenuSubTrigger class="context-menu-item" disabled={item.disabled}>
				{@render face(item, icons)}
				<span class="context-menu-more" aria-hidden="true"><Icon name="chevron" size={14} /></span>
			</MenuSubTrigger>
			<MenuSubContent class="context-menu" sideOffset={4} collisionPadding={8}>
				{#each inner as one, index (one.value)}
					{#if index && one.group !== inner[index - 1].group}<MenuSeparator class="context-menu-separator" />{/if}
					{@render row(one, innerIcons)}
				{/each}
			</MenuSubContent>
		</MenuSub>
	{:else}
		<MenuItem class="context-menu-item" value={item.value} label={item.label} disabled={item.disabled} destructive={item.destructive}>
			{@render face(item, icons)}
			{#if item.checked}<span class="context-menu-check"><Icon name="check" size={16} /></span><span class="visually-hidden">, on</span>{/if}
			{#if item.shortcut}<kbd class="context-menu-key" aria-hidden="true">{item.shortcut}</kbd>{/if}
		</MenuItem>
	{/if}
{/snippet}

<Menu controller={menu} onAction={(value) => onAction(value)}>
	<MenuContent class="context-menu" side="bottom" align="start" sideOffset={2} collisionPadding={8} finalFocus="none">
		{#each groups as group, index (group.name)}
			{#if index}<MenuSeparator class="context-menu-separator" />{/if}
			<MenuGroup>
				{#if title && !index}<MenuGroupLabel class="context-menu-title">{title}</MenuGroupLabel>{/if}
				{#each group.items as item (item.value)}{@render row(item, icons)}{/each}
			</MenuGroup>
		{/each}
		{#if destructive.length}
			{#if safe.length}<MenuSeparator class="context-menu-separator" />{/if}
			{#each destructive as item (item.value)}{@render row(item, icons)}{/each}
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
		align-items: center;
		gap: var(--space-3);
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

	.context-menu-text {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	:global(.context-menu-icon) {
		display: inline-grid;
		flex: none;
		width: 1rem;
		color: var(--text-secondary);
	}

	.context-menu-check {
		display: flex;
		flex: none;
	}

	.context-menu-key {
		flex: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--fs-xs);
	}

	.context-menu-more {
		display: inline-flex;
		flex: none;
		color: var(--text-muted);
		rotate: -90deg;
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
