<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Switch, SwitchThumb } from '@ui-sdk/svelte/switch';

	interface Props {
		/** Supports bind:checked and native form submission. */
		checked?: boolean;
		name?: string;
		value?: string;
		disabled?: boolean;
		children?: Snippet;
		[key: string]: unknown;
	}

	let { checked = $bindable(false), name, value, disabled = false, children, ...rest }: Props = $props();
</script>

<label class="switch">
	<Switch class="switch-track" bind:checked {name} {value} {disabled} {...rest}><SwitchThumb class="switch-thumb" /></Switch>
	{#if children}<span>{@render children()}</span>{/if}
</label>

<style>
	.switch {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	:global(.switch-track) {
		display: inline-flex;
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

	:global(.switch-thumb) {
		display: block;
		width: 1.125em;
		height: 1.125em;
		border-radius: var(--radius-full);
		background: var(--text-primary);
		transition: translate var(--duration) var(--ease-out);
	}

	:global(.switch-track[data-checked]) {
		border-color: var(--accent);
		background: var(--accent);
	}

	:global(.switch-thumb[data-checked]) {
		translate: 1em 0;
	}

	:global(:dir(rtl) .switch-thumb[data-checked]) {
		translate: -1em 0;
	}

	:global(.switch-track:focus-visible) {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	.switch:has(:global([data-disabled])) {
		cursor: default;
		opacity: 0.5;
	}
</style>
