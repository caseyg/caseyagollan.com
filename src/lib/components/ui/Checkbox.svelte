<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Checkbox, CheckboxIndicator } from '@ui-sdk/svelte/checkbox';

	interface Props {
		/** Bind it, or listen with `onCheckedChange`. Inside a `CheckboxGroup`, the group decides. */
		checked?: boolean;
		/** Some, not all, of the boxes it stands for are checked. */
		indeterminate?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		/** What it submits, and its entry in a `CheckboxGroup`'s value. */
		value?: string;
		name?: string;
		disabled?: boolean;
		/** The label beside the box. Without one, pass `aria-label`. */
		children?: Snippet;
		[key: string]: unknown;
	}

	let { checked = $bindable(), indeterminate = false, onCheckedChange, value, name, disabled = false, children, ...rest }: Props = $props();

	const state = $derived(indeterminate ? 'indeterminate' : checked);
</script>

{#snippet box()}
	<CheckboxIndicator class="checkbox-indicator" aria-hidden="true">{indeterminate ? '–' : '✓'}</CheckboxIndicator>
{/snippet}

<label class="checkbox">
	{#if checked === undefined && !indeterminate}
		<Checkbox class="checkbox-box" {value} {name} {disabled} {...rest}>{@render box()}</Checkbox>
	{:else}
		<Checkbox class="checkbox-box" checked={state} onCheckedChange={(next) => { checked = next === true; onCheckedChange?.(checked); }} {value} {name} {disabled} {...rest}>{@render box()}</Checkbox>
	{/if}
	{#if children}<span>{@render children()}</span>{/if}
</label>

<style>
	.checkbox {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		cursor: pointer;
	}

	:global(.checkbox-box) {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 1em;
		height: 1em;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: 3px;
		background: var(--surface-sunken);
		color: var(--text-primary);
		font: inherit;
		font-size: inherit;
		line-height: 1;
		cursor: inherit;
		transform: translateY(0.12em);
		transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease);
	}

	:global(.checkbox-box[data-checked]),
	:global(.checkbox-box[data-indeterminate]) {
		border-color: var(--accent);
		background: var(--accent);
	}

	:global(.checkbox-indicator) {
		font-size: 0.75em;
		font-weight: var(--fw-semibold);
	}

	.checkbox:has(:global([data-disabled])) {
		cursor: default;
		opacity: 0.6;
	}
</style>
