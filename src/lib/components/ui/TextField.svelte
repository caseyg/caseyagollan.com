<script lang="ts">
	import { Field, FieldDescription, FieldLabel } from '@ui-sdk/svelte/field';
	import { Input } from '@ui-sdk/svelte/input';
	import { Textarea } from '@ui-sdk/svelte/textarea';

	interface Props {
		label: string;
		value?: string;
		hint?: string;
		/** Renders a textarea that grows with its text. */
		multiline?: boolean;
		/** Monospace, for tokens and other literal strings. */
		mono?: boolean;
		[key: string]: unknown;
	}

	let { label, value = $bindable(''), hint, multiline = false, mono = false, ...rest }: Props = $props();
</script>

<Field class="text-field">
	<FieldLabel class="text-field-label">{label}</FieldLabel>
	{#if multiline}
		<Textarea class="text-field-control {mono ? 'mono' : ''}" bind:value autoResize {...rest} />
	{:else}
		<Input class="text-field-control {mono ? 'mono' : ''}" bind:value {...rest} />
	{/if}
	{#if hint}<FieldDescription class="text-field-hint">{hint}</FieldDescription>{/if}
</Field>

<style>
	:global(.text-field) {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: var(--space-3) 0;
	}

	:global(.text-field-label) {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	:global(.text-field-control) {
		box-sizing: border-box;
		width: 100%;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		color: inherit;
		font: inherit;
		line-height: var(--lh-normal);
		transition: border-color var(--duration) var(--ease);
	}

	:global(.text-field-control:hover:not([data-disabled])),
	:global(.text-field-control:focus) {
		border-color: var(--text-primary);
	}

	:global(.text-field-control[data-disabled]) {
		opacity: 0.5;
	}

	:global(textarea.text-field-control) {
		min-height: 5rem;
		max-height: 20rem;
		resize: vertical;
	}

	:global(.text-field-control.mono) {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	:global(.text-field-hint) {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
	}
</style>
