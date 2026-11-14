<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from './ComposerIcon.svelte';

	interface Props {
		/** `icon` is a round icon-only button; `text` a quiet pill; `primary` the main action (Publish, Save). */
		variant?: 'icon' | 'text' | 'primary';
		/** Shown alone for `icon`, before the label otherwise. */
		icon?: IconName;
		/** Accessible name and tooltip; required for icon-only buttons. */
		label?: string;
		size?: 'sm' | 'md';
		/** Renders a link. */
		href?: string;
		/** Toggle state for buttons that open an optional field. */
		pressed?: boolean;
		children?: Snippet;
		[key: string]: unknown;
	}

	let { variant = 'text', icon, label, size = 'md', href, pressed, children, ...rest }: Props = $props();
	const iconSize = $derived(variant === 'icon' ? (size === 'sm' ? 16 : 20) : 16);
</script>

<svelte:element
	this={href ? 'a' : 'button'}
	{href}
	type={href ? undefined : ((rest.type as string | undefined) ?? 'button')}
	class="composer-button {variant} {size}"
	aria-label={variant === 'icon' ? label : undefined}
	title={label}
	aria-pressed={pressed}
	{...rest}
>
	{#if icon}<Icon name={icon} size={iconSize} />{/if}
	{#if variant !== 'icon'}{@render children?.()}{/if}
</svelte:element>

<style>
	.composer-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); border: 0; border-radius: var(--radius-full); background: transparent; color: var(--text-secondary); font: inherit; font-size: var(--fs-sm); line-height: var(--lh-snug); text-decoration: none; white-space: nowrap; cursor: pointer; transition: background var(--duration) var(--ease), color var(--duration) var(--ease); }
	.composer-button:disabled { opacity: 0.5; cursor: default; }
	.icon { width: 2.25rem; height: 2.25rem; padding: 0; }
	.icon.sm { width: 1.75rem; height: 1.75rem; }
	.text { padding: var(--space-1) var(--space-3); }
	.icon:hover:not(:disabled), .icon:focus-visible, .text:hover:not(:disabled), .text:focus-visible { background: var(--surface-2); color: var(--text-primary); }
	.icon[aria-pressed='true'] { background: var(--surface-1); color: var(--text-primary); }
	.primary { padding: var(--space-2) var(--space-4); background: var(--accent); color: var(--text-primary); font-weight: var(--fw-semibold); }
	.primary:hover:not(:disabled) { background: var(--accent-hover); }
	.primary:disabled { opacity: 0.6; }
</style>
