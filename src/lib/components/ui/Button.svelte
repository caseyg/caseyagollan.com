<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** `primary` for the one main action, `secondary` for the rest, `quiet` for low-emphasis links. */
		variant?: 'primary' | 'secondary' | 'quiet';
		size?: 'sm' | 'md';
		/** Renders a link styled as a button. */
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	}

	let { variant = 'secondary', size = 'md', href, type = 'button', disabled = false, class: className = '', children, ...rest }: Props = $props();
</script>

{#if href}
	<a {href} class="button button--{variant} button--{size} {className}" {...rest}>{@render children()}</a>
{:else}
	<button {type} {disabled} class="button button--{variant} button--{size} {className}" {...rest}>{@render children()}</button>
{/if}

<style>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4em;
		box-sizing: border-box;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-weight: var(--fw-medium);
		line-height: var(--lh-snug);
		text-decoration: none;
		cursor: pointer;
		transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), color var(--duration) var(--ease);
	}

	.button--md {
		padding: 0.5rem 0.9rem;
		font-size: var(--fs-base);
	}

	.button--sm {
		padding: 0.25rem 0.6rem;
		font-size: var(--fs-xs);
	}

	.button--primary {
		border-color: var(--accent);
		background: var(--accent);
	}

	.button--primary:hover:not(:disabled) {
		border-color: var(--accent-hover);
		background: var(--accent-hover);
	}

	.button--secondary {
		border-color: var(--border-strong);
	}

	.button--secondary:hover:not(:disabled) {
		border-color: var(--text-primary);
		background: var(--surface-2);
	}

	.button--quiet {
		margin-left: calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-2);
		color: var(--text-muted);
		font-weight: var(--fw-regular);
	}

	.button--quiet:hover:not(:disabled) {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.button:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
