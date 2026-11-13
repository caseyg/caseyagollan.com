<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'type' | 'children'> {
		/** Supports bind:checked and native form submission. */
		checked?: boolean;
		children?: Snippet;
	}

	let { checked = $bindable(false), children, ...rest }: Props = $props();
</script>

<label class="toggle">
	<input {...rest} type="checkbox" role="switch" bind:checked />
	{#if children}<span>{@render children()}</span>{/if}
</label>

<style>
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	input {
		appearance: none;
		flex-shrink: 0;
		width: 2.5em;
		height: 1.5em;
		box-sizing: border-box;
		margin: 0;
		padding: 0.125em;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-full);
		background: var(--surface-sunken);
		font: inherit;
		cursor: inherit;
		transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease);
	}

	input::before {
		content: '';
		display: block;
		width: 1.125em;
		height: 1.125em;
		border-radius: var(--radius-full);
		background: var(--text-primary);
		transition: transform var(--duration) var(--ease);
	}

	input:checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	input:checked::before {
		transform: translateX(1em);
	}

	input:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	.toggle:has(input:disabled) {
		cursor: default;
		opacity: 0.5;
	}

	@media (forced-colors: active) {
		input { appearance: auto; }
		input::before { display: none; }
	}
</style>
