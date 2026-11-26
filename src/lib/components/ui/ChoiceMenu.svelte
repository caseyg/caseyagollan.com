<script module lang="ts">
	import type { IconName } from './Icon.svelte';

	export interface Choice {
		value: string;
		label: string;
		icon?: IconName;
	}
</script>

<script lang="ts">
	import { Menu, MenuContent, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@ui-sdk/svelte/menu';
	import Icon from './Icon.svelte';
	// The trigger is drawn as the round icon button, whose styles live with Button.
	import './Button.svelte';

	interface Props {
		/** Names the button, and says what the choice is about. */
		label: string;
		choices: Choice[];
		/** The choice in effect; its icon is the button's. */
		value: string;
		onchange?: (value: string) => void;
		align?: 'start' | 'end';
		class?: string;
	}

	let { label, choices, value = $bindable(), onchange, align = 'end', class: className = '' }: Props = $props();

	let open = $state(false);
	const current = $derived(choices.find((choice) => choice.value === value) ?? choices[0]);

	function choose(next: string) {
		open = false;
		if (next === value) return;
		value = next;
		onchange?.(next);
	}
</script>

<!--
	A small round button that opens a menu of a few ways something can be, one of them in effect
	(checked), such as where a panel sits. Built on ui-sdk Menu's radio group.
-->
<Menu bind:open>
	<MenuTrigger class="button button--icon button--sm choice-menu-trigger {className}" aria-label="{label}: {current?.label}" title={label}>
		{#if current?.icon}<Icon name={current.icon} size={16} />{/if}
	</MenuTrigger>
	<MenuContent class="choice-menu" side="bottom" {align} sideOffset={4} collisionPadding={8}>
		<MenuRadioGroup {value} onValueChange={(next) => choose(String(next))}>
			{#each choices as choice (choice.value)}
				<MenuRadioItem class="choice-menu-item" value={choice.value} label={choice.label}>
					{#if choice.icon}<Icon name={choice.icon} size={16} />{/if}
					<span class="choice-menu-label">{choice.label}</span>
					<MenuItemIndicator class="choice-menu-check" keepMounted><Icon name="check" size={16} /></MenuItemIndicator>
				</MenuRadioItem>
			{/each}
		</MenuRadioGroup>
	</MenuContent>
</Menu>

<style>
	:global(.choice-menu) {
		box-sizing: border-box;
		min-width: 11rem;
		margin: 0;
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-primary);
		color: var(--text-primary);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
		transform-origin: var(--transform-origin);
		transition: opacity 120ms var(--ease-out), scale 120ms var(--ease-out);
	}

	:global(.choice-menu[data-starting-style]),
	:global(.choice-menu[data-ending-style]) {
		opacity: 0;
		scale: 0.97;
	}

	:global(.choice-menu-item) {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		outline: none;
		cursor: default;
	}

	:global(.choice-menu-item[data-highlighted]) {
		background: var(--surface-2);
	}

	.choice-menu-label {
		flex: 1;
	}

	:global(.choice-menu-check) {
		display: flex;
	}

	:global(.choice-menu-check[data-unchecked]),
	:global(.choice-menu-item:not([data-checked]) .choice-menu-check) {
		visibility: hidden;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.choice-menu) {
			transition: none;
		}
	}
</style>
