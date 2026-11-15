<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import { Button } from '@ui-sdk/svelte/button';
	import { ToolbarButton } from '@ui-sdk/svelte/toolbar';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		/**
		 * `primary` for the one main action, `secondary` for the rest, `quiet` for low-emphasis
		 * actions and links, `icon` for a round button showing only its icon.
		 */
		variant?: 'primary' | 'secondary' | 'quiet' | 'icon';
		size?: 'sm' | 'md';
		/** Shown alone for `icon`, before the label otherwise. */
		icon?: IconName;
		/** Accessible name and tooltip; required for `icon`. */
		label?: string;
		/** Renders a link styled as a button. */
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		/** For a button that shows or hides something: whether it is showing. */
		pressed?: boolean;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	}

	let { variant = 'secondary', size = 'md', icon, label, href, type = 'button', disabled = false, pressed, class: className = '', children, ...rest }: Props = $props();

	const iconSize = $derived(variant === 'icon' ? (size === 'sm' ? 16 : 20) : 16);
	const inToolbar = getContext('ui:toolbar') === true;
	const classes = $derived(`button button--${variant} button--${size} ${className}`);
</script>

{#snippet content()}
	{#if icon}<Icon name={icon} size={iconSize} />{/if}
	{#if variant !== 'icon'}{@render children?.()}{/if}
{/snippet}

{#if href}
	<Button class={classes} {disabled} aria-label={variant === 'icon' ? label : undefined} title={label} {...rest}>
		{#snippet render({ props })}<a {...props} {href}>{@render content()}</a>{/snippet}
	</Button>
{:else if inToolbar}
	<ToolbarButton class={classes} {type} {disabled} aria-label={variant === 'icon' ? label : undefined} title={label} aria-pressed={pressed} {...rest}>
		{@render content()}
	</ToolbarButton>
{:else}
	<Button class={classes} {type} {disabled} aria-label={variant === 'icon' ? label : undefined} title={label} aria-pressed={pressed} {...rest}>
		{@render content()}
	</Button>
{/if}

<style>
	:global(.button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		box-sizing: border-box;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-weight: var(--fw-medium);
		line-height: var(--lh-snug);
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), color var(--duration) var(--ease), scale 160ms var(--ease-out);
	}

	:global(.button:active:not([data-disabled])) {
		scale: 0.97;
	}

	:global(.button--md) {
		padding: var(--space-2) var(--space-4);
		font-size: var(--fs-sm);
	}

	:global(.button--sm) {
		padding: var(--space-1) var(--space-3);
		font-size: var(--fs-xs);
	}

	:global(.button--primary) {
		border-color: var(--accent);
		background: var(--accent);
	}

	:global(.button--secondary) {
		border-color: var(--border-strong);
	}

	:global(.button--quiet) {
		color: var(--text-secondary);
		font-weight: var(--fw-regular);
	}

	:global(.button--quiet.button--md) {
		padding: var(--space-1) var(--space-3);
	}

	:global(.button--icon) {
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
	}

	:global(.button--icon.button--sm) {
		width: 1.75rem;
		height: 1.75rem;
	}

	:global(.button--icon[aria-pressed='true']) {
		background: var(--surface-1);
		color: var(--text-primary);
	}

	@media (hover: hover) {
		:global(.button--primary:hover:not([data-disabled])) {
			border-color: var(--accent-hover);
			background: var(--accent-hover);
		}

		:global(.button--secondary:hover:not([data-disabled])) {
			border-color: var(--text-primary);
			background: var(--surface-2);
		}

		:global(.button--quiet:hover:not([data-disabled])),
		:global(.button--icon:hover:not([data-disabled])) {
			background: var(--surface-2);
			color: var(--text-primary);
		}
	}

	:global(.button[data-disabled]) {
		opacity: 0.5;
		cursor: default;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.button:active:not([data-disabled])) {
			scale: none;
		}
	}
</style>
