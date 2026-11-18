<script lang="ts">
	import { Field, FieldDescription, FieldError, FieldLabel } from '@ui-sdk/svelte/field';
	import { Input } from '@ui-sdk/svelte/input';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Button from './Button.svelte';

	interface Props {
		label: string;
		/** The field's name, sent with the form when JavaScript is off. */
		name: string;
		value?: string;
		type?: 'text' | 'url' | 'email';
		placeholder?: string;
		inputmode?: 'text' | 'url' | 'email';
		autocomplete?: HTMLInputAttributes['autocomplete'];
		buttonLabel: string;
		/** Shown on the button while `busy`. */
		busyLabel?: string;
		busy?: boolean;
		/** A quiet line under the field. Hidden while there is an error. */
		hint?: string;
		error?: string;
		/** Hides the label visually, for a place that already says what the field is for. */
		hideLabel?: boolean;
		/** Where the form goes without JavaScript. */
		action?: string;
		method?: 'get' | 'post';
		target?: string;
		/** Extra fields sent with it, such as a Webmention's `target`. */
		hidden?: Record<string, string>;
		/** Called with the trimmed value instead of sending the form. */
		onsubmit?: (value: string) => unknown;
	}

	let {
		label,
		name,
		value = $bindable(''),
		type = 'text',
		placeholder,
		inputmode,
		autocomplete = 'off',
		buttonLabel,
		busyLabel,
		busy = false,
		hint,
		error = $bindable(''),
		hideLabel = false,
		action,
		method = 'post',
		target,
		hidden = {},
		onsubmit
	}: Props = $props();

	function submit(event: SubmitEvent) {
		if (!onsubmit) return;
		event.preventDefault();
		if (busy) return;
		onsubmit(value.trim());
	}
</script>

<!-- One field and one button on a line, as the newsletter signup is: a server, an address, a link. -->
<form class="inline-form" {action} {method} {target} onsubmit={submit}>
	<Field {name} invalid={error ? true : undefined}>
		<FieldLabel class={hideLabel ? 'visually-hidden' : 'inline-form-label'}>{label}</FieldLabel>
		<div class="row">
			<Input class="text-field-control inline-form-input" {type} {placeholder} {inputmode} {autocomplete} autocapitalize="off" spellcheck="false" required bind:value onValueChange={() => (error = '')} disabled={busy} />
			<Button type="submit" variant="primary" disabled={busy}>{busy ? (busyLabel ?? buttonLabel) : buttonLabel}</Button>
		</div>
		<FieldError class="inline-form-error" match={error ? true : undefined}>
			{#snippet children(state)}{error || state.message}{/snippet}
		</FieldError>
		{#if hint && !error}<FieldDescription class="inline-form-hint">{hint}</FieldDescription>{/if}
	</Field>
	{#each Object.entries(hidden) as [key, val] (key)}<input type="hidden" name={key} value={val} />{/each}
</form>

<style>
	.inline-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
		margin: 0;
	}

	:global(.inline-form-label) {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	:global(.inline-form-input) {
		flex: 1;
		min-width: 0;
	}

	:global(.inline-form-input::placeholder) {
		color: var(--text-muted);
	}

	:global(.inline-form-error),
	:global(.inline-form-hint) {
		margin: var(--space-1) 0 0;
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
	}

	:global(.inline-form-error) {
		color: var(--text-primary);
	}

	:global(.inline-form-hint) {
		color: var(--text-muted);
	}
</style>
