<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** One-way state; listen with `onchange`. Ignored when `group` is bound. */
		checked?: boolean;
		/** Bind an array to collect the `value` of each checked box. */
		group?: string[];
		value?: string;
		indeterminate?: boolean;
		children?: Snippet;
		[key: string]: unknown;
	}

	let { checked = false, group = $bindable(), value, indeterminate = false, children, ...rest }: Props = $props();
</script>

<label class="checkbox">
	{#if group !== undefined}
		<input type="checkbox" bind:group {value} {...rest} />
	{:else}
		<input type="checkbox" {checked} {indeterminate} {value} {...rest} />
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

	input {
		flex-shrink: 0;
		width: 1em;
		height: 1em;
		margin: 0;
		accent-color: var(--accent);
		transform: translateY(0.12em);
	}

	.checkbox:has(input:disabled) {
		cursor: default;
		opacity: 0.6;
	}
</style>
