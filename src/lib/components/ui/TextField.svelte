<script lang="ts">
	interface Props {
		label: string;
		value?: string;
		hint?: string;
		/** Renders a textarea. */
		multiline?: boolean;
		/** Monospace, for tokens and other literal strings. */
		mono?: boolean;
		id?: string;
		[key: string]: unknown;
	}

	let { label, value = $bindable(''), hint, multiline = false, mono = false, id, ...rest }: Props = $props();

	const uid = $props.id();
	const fieldId = $derived(id ?? uid);
</script>

<div class="field">
	<label for={fieldId}>{label}</label>
	{#if multiline}
		<textarea id={fieldId} class="control" class:mono bind:value aria-describedby={hint ? `${fieldId}-hint` : undefined} {...rest}></textarea>
	{:else}
		<input id={fieldId} class="control" class:mono bind:value aria-describedby={hint ? `${fieldId}-hint` : undefined} {...rest} />
	{/if}
	{#if hint}<p class="hint" id="{fieldId}-hint">{hint}</p>{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: var(--space-3) 0;
	}

	label {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.control {
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

	.control:hover:not(:disabled),
	.control:focus {
		border-color: var(--text-primary);
	}

	.control:disabled {
		opacity: 0.5;
	}

	textarea.control {
		min-height: 5rem;
		resize: vertical;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
	}
</style>
