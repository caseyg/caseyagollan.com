<script module lang="ts">
	import type { IconName } from './Icon.svelte';

	export interface Choice {
		value: string;
		label: string;
		icon?: IconName;
		/** What a `text` button reads when this is in effect, where the label would be too long for it. */
		short?: string;
		/** A quieter line under the label, such as what the choice is good for. */
		detail?: string;
		/** Choices that share a group sit together under it as a heading. */
		group?: string;
	}
</script>

<script lang="ts">
	import { Menu, MenuContent, MenuGroupLabel, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@ui-sdk/svelte/menu';
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
		/** Which way the menu opens; `top` for a button near the bottom of the page. */
		side?: 'top' | 'bottom';
		/** The button reads as the choice in effect, in words with a chevron, where an icon wouldn't say enough. */
		text?: boolean;
		class?: string;
	}

	let { label, choices, value = $bindable(), onchange, align = 'end', side = 'bottom', text = false, class: className = '' }: Props = $props();

	let open = $state(false);
	const current = $derived(choices.find((choice) => choice.value === value) ?? choices[0]);
	/** The choices under their headings, in the order the headings first appear; ungrouped ones share a group with no heading. */
	const groups = $derived.by(() => {
		const all: { name: string; choices: Choice[] }[] = [];
		for (const choice of choices) {
			const name = choice.group ?? '';
			const group = all.find((one) => one.name === name);
			if (group) group.choices.push(choice); else all.push({ name, choices: [choice] });
		}
		return all;
	});

	function choose(next: string) {
		open = false;
		if (next === value) return;
		value = next;
		onchange?.(next);
	}
</script>

<!--
	A small button that opens a menu of a few ways something can be, one of them in effect
	(checked), such as where a panel sits or which model answers. The button is the choice's icon,
	or with `text` its name. Choices can carry a second line and sit under group headings. Built on
	ui-sdk Menu's radio groups: one per heading, all holding the same value.
-->
<Menu bind:open>
	<MenuTrigger class="{text ? 'choice-menu-text' : 'button button--icon button--sm'} choice-menu-trigger {className}" aria-label="{label}: {current?.label}" title={label}>
		{#if current?.icon}<Icon name={current.icon} size={16} />{/if}
		{#if text}<span class="choice-menu-current">{current?.short ?? current?.label}</span><span class="choice-menu-chevron"><Icon name="chevron" size={14} /></span>{/if}
	</MenuTrigger>
	<MenuContent class="choice-menu" {side} {align} sideOffset={4} collisionPadding={8}>
		{#each groups as group (group.name)}
			<MenuRadioGroup {value} onValueChange={(next) => choose(String(next))}>
				{#if group.name}<MenuGroupLabel class="choice-menu-group">{group.name}</MenuGroupLabel>{/if}
				{#each group.choices as choice (choice.value)}
					<MenuRadioItem class="choice-menu-item" value={choice.value} label={choice.label}>
						{#if choice.icon}<Icon name={choice.icon} size={16} />{/if}
						<span class="choice-menu-label">{choice.label}{#if choice.detail}<span class="choice-menu-detail">{choice.detail}</span>{/if}</span>
						<MenuItemIndicator class="choice-menu-check" keepMounted><Icon name="check" size={16} /></MenuItemIndicator>
					</MenuRadioItem>
				{/each}
			</MenuRadioGroup>
		{/each}
	</MenuContent>
</Menu>

<style>
	:global(.choice-menu) {
		box-sizing: border-box;
		min-width: 11rem;
		max-height: var(--available-height);
		margin: 0;
		overflow-y: auto;
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
		display: grid;
		flex: 1;
		gap: 1px;
		min-width: 0;
	}

	.choice-menu-detail {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	:global(.choice-menu-group) {
		padding: var(--space-2) var(--space-2) var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	/* The button as words: the choice in effect and a chevron, quiet until hovered or open. */
	:global(.choice-menu-text) {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		gap: var(--space-1);
		max-width: 100%;
		height: 2rem;
		padding: 0 var(--space-2);
		border: 0;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-xs);
		cursor: pointer;
	}

	:global(.choice-menu-text:hover),
	:global(.choice-menu-text[data-open]) {
		background: var(--surface-sunken);
		color: var(--text-primary);
	}

	.choice-menu-current {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.choice-menu-chevron {
		display: inline-flex;
		flex-shrink: 0;
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
