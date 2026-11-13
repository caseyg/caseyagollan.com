<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		/** One-way state; listen with `onchange`. Ignored when `group` is bound. */
		checked?: boolean;
		/** Bind an array to collect the `value` of each checked box. */
		group?: string[];
		value?: string;
		indeterminate?: boolean;
		onchange?: HTMLInputAttributes['onchange'];
		children?: Snippet;
		[key: string]: unknown;
	}

	let { checked = false, group = $bindable(), value, indeterminate = false, onchange, children, ...rest }: Props = $props();
</script>

<label class="checkbox">
	{#if group !== undefined}
		<!-- Native bind:group only groups inputs within the same component instance. -->
		<input type="checkbox" {value} {...rest} checked={group.includes(value ?? 'on')} onchange={(event) => {
			const selected = event.currentTarget.value;
			group = event.currentTarget.checked
				? [...(group ?? []).filter((item) => item !== selected), selected]
				: (group ?? []).filter((item) => item !== selected);
			onchange?.(event);
		}} />
	{:else}
		<input type="checkbox" {checked} {indeterminate} {value} {...rest} {onchange} />
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
