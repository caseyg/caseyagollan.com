<script module lang="ts">
	import type { IconName } from './Icon.svelte';

	export interface ActionItem {
		value: string;
		label: string;
		icon?: IconName;
		/** A few quieter words at the end of the row, such as what the action does. */
		detail?: string;
		/** Items that share a group sit together under it as a heading. */
		group?: string;
		/** The key that does the same, shown as a hint at the end of the row. */
		shortcut?: string;
		disabled?: boolean;
		/** Makes the item open a second menu beside it, of these. */
		items?: ActionItem[];
	}

	/** A choice at the top of the menu that the actions under it follow, such as what they apply to. */
	export interface ActionScope {
		label: string;
		value: string;
		choices: { value: string; label: string }[];
	}

	/** A switch in the menu, such as a mode the actions leave on. */
	export interface ActionToggle {
		label: string;
		detail?: string;
		checked: boolean;
	}
</script>

<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import { Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuItemIcon, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '@ui-sdk/svelte/menu';
	import { ToolbarButton } from '@ui-sdk/svelte/toolbar';
	import Icon from './Icon.svelte';
	import MenuChevron from './MenuChevron.svelte';
	// The trigger is drawn as a Button and the menu as a ChoiceMenu, whose styles live with them.
	import './Button.svelte';
	import './ChoiceMenu.svelte';

	interface Props {
		/** Names the button: its text, or with `iconOnly` its accessible name and tooltip. */
		label: string;
		icon?: IconName;
		/** The button shows its icon and a chevron, no words. */
		iconOnly?: boolean;
		items: ActionItem[];
		onaction?: (value: string) => void;
		scope?: ActionScope;
		onscope?: (value: string) => void;
		toggle?: ActionToggle;
		ontoggle?: (checked: boolean) => void;
		/** The item in effect, which gets a check: the one a mode keeps using, say. */
		current?: string;
		/** Draws the button as held down, such as while one of its tools is in hand. */
		pressed?: boolean;
		disabled?: boolean;
		align?: 'start' | 'end';
		/** Which way the menu opens; `top` for a button near the bottom of the page. */
		side?: 'top' | 'bottom';
		class?: string;
		/** Replaces the label's text inside the button. */
		children?: Snippet;
	}

	let { label, icon, iconOnly = false, items, onaction, scope, onscope, toggle, ontoggle, current, pressed = false, disabled = false, align = 'start', side = 'bottom', class: className = '', children }: Props = $props();

	let open = $state(false);
	const inToolbar = getContext('ui:toolbar') === true;
	const hasIcons = $derived(items.some((item) => item.icon));
	/** The items under their headings, in the order the headings first appear. */
	const groups = $derived.by(() => {
		const all: { name: string; items: ActionItem[] }[] = [];
		for (const item of items) {
			const name = item.group ?? '';
			const group = all.find((one) => one.name === name);
			if (group) group.items.push(item); else all.push({ name, items: [item] });
		}
		return all;
	});
	const triggerClass = $derived(`button button--quiet button--sm action-menu-trigger ${className}`);
</script>

{#snippet face(item: ActionItem)}
	{#if hasIcons}<MenuItemIcon class="action-menu-icon">{#if item.icon}<Icon name={item.icon} size={16} />{/if}</MenuItemIcon>{/if}
	<span class="action-menu-label">{item.label}</span>
	{#if item.detail}<span class="action-menu-detail">{item.detail}</span>{/if}
{/snippet}

{#snippet row(item: ActionItem)}
	{#if item.items}
		<MenuSub>
			<MenuSubTrigger class="choice-menu-item" disabled={item.disabled}>
				{@render face(item)}
				<span class="action-menu-more" aria-hidden="true"><Icon name="chevron" size={14} /></span>
			</MenuSubTrigger>
			<MenuSubContent class="choice-menu action-menu" sideOffset={4} collisionPadding={8}>
				{#each item.items as inner (inner.value)}{@render row(inner)}{/each}
			</MenuSubContent>
		</MenuSub>
	{:else}
		<MenuItem class="choice-menu-item" value={item.value} label={item.label} disabled={item.disabled}>
			{@render face(item)}
			{#if item.value === current}<span class="action-menu-current"><Icon name="check" size={16} /></span><span class="visually-hidden">, in effect</span>{/if}
			{#if item.shortcut}<kbd class="action-menu-key" aria-hidden="true">{item.shortcut}</kbd>{/if}
		</MenuItem>
	{/if}
{/snippet}

{#snippet trigger()}
	{#if icon}<Icon name={icon} size={16} />{/if}
	{#if !iconOnly}{#if children}{@render children()}{:else}{label}{/if}{/if}
	<MenuChevron split={!iconOnly} />
{/snippet}

<!--
	A button that opens a menu of things to do: each row an action, with an icon, a second line or
	a key hint, under group headings, some opening a second menu. A `scope` adds a choice at the
	top that stays open while it is changed. Inside a Toolbar the button joins its arrow keys.
-->
<Menu bind:open onAction={(value) => onaction?.(String(value))}>
	{#if inToolbar}
		<ToolbarButton {disabled}>
			{#snippet render({ props })}
				<MenuTrigger {...props} class={triggerClass} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} data-pressed={pressed || undefined}>{@render trigger()}</MenuTrigger>
			{/snippet}
		</ToolbarButton>
	{:else}
		<MenuTrigger class={triggerClass} {disabled} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} data-pressed={pressed || undefined}>{@render trigger()}</MenuTrigger>
	{/if}
	<MenuContent class="choice-menu action-menu" {side} {align} sideOffset={6} collisionPadding={8}>
		{#if scope}
			<MenuRadioGroup value={scope.value} onValueChange={(next) => onscope?.(String(next))}>
				<MenuGroupLabel class="choice-menu-group">{scope.label}</MenuGroupLabel>
				{#each scope.choices as choice (choice.value)}
					<MenuRadioItem class="choice-menu-item" value={choice.value} label={choice.label}>
						<span class="action-menu-label">{choice.label}</span>
						<MenuItemIndicator class="choice-menu-check" keepMounted><Icon name="check" size={16} /></MenuItemIndicator>
					</MenuRadioItem>
				{/each}
			</MenuRadioGroup>
			<MenuSeparator class="action-menu-separator" />
		{/if}
		{#if toggle}
			<MenuCheckboxItem class="choice-menu-item" value="toggle" label={toggle.label} checked={toggle.checked} onCheckedChange={(checked) => ontoggle?.(checked)}>
				<span class="action-menu-label">{toggle.label}</span>
				{#if toggle.detail}<span class="action-menu-detail">{toggle.detail}</span>{/if}
				<MenuItemIndicator class="choice-menu-check" keepMounted><Icon name="check" size={16} /></MenuItemIndicator>
			</MenuCheckboxItem>
			<MenuSeparator class="action-menu-separator" />
		{/if}
		{#each groups as group, index (group.name)}
			{#if index && !group.name}<MenuSeparator class="action-menu-separator" />{/if}
			<MenuGroup>
				{#if group.name}<MenuGroupLabel class="choice-menu-group">{group.name}</MenuGroupLabel>{/if}
				{#each group.items as item (item.value)}{@render row(item)}{/each}
			</MenuGroup>
		{/each}
	</MenuContent>
</Menu>

<style>
	:global(.action-menu-trigger) {
		--menu-chevron-divider: var(--border);
		padding-inline-end: 0;
	}

	:global(.action-menu-trigger[data-open]),
	:global(.action-menu-trigger[data-pressed]) {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	:global(.action-menu) {
		min-width: 13rem;
		max-height: min(70vh, var(--available-height));
	}

	:global(.action-menu-icon) {
		display: inline-grid;
		flex: none;
		width: 1rem;
		color: var(--text-secondary);
	}

	:global(.action-menu .choice-menu-item[data-disabled]) {
		opacity: 0.5;
	}

	.action-menu-label {
		flex: 1;
		white-space: nowrap;
	}

	/* What the action does, quieter, at the end of its row. */
	.action-menu-detail {
		flex: none;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}

	.action-menu-current {
		display: flex;
		flex: none;
	}

	.action-menu-key {
		flex: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--fs-xs);
	}

	.action-menu-more {
		display: inline-flex;
		flex: none;
		color: var(--text-muted);
		rotate: -90deg;
	}

	:global(.action-menu-separator) {
		height: 1px;
		margin: var(--space-1) 0;
		background: var(--border);
	}
</style>
