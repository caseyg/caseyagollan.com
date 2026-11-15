<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CheckboxGroup } from '@ui-sdk/svelte/checkbox';

	interface Props {
		/** Names the set of choices, such as "Also post to". */
		label?: string;
		/** The checked boxes' values, in the order they appear. */
		value?: string[];
		/** Form field name every box submits under. */
		name?: string;
		/** `stack` for checkboxes with sentences, `row` for a wrapping row of `ToggleChip`s. */
		layout?: 'stack' | 'row';
		disabled?: boolean;
		children: Snippet;
	}

	let { label, value = $bindable([]), name, layout = 'stack', disabled = false, children }: Props = $props();
</script>

<CheckboxGroup class="checkbox-group checkbox-group--{layout}" aria-label={label} bind:value {name} {disabled}>{@render children()}</CheckboxGroup>

<style>
	:global(.checkbox-group) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	:global(.checkbox-group--row) {
		display: inline-flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
</style>
