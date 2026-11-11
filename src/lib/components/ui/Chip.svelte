<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Renders a link when set, a button when `onclick` is set, otherwise a span. */
		href?: string;
		/** `ghost` sits in running metadata; `soft` is a standalone tag. */
		variant?: 'ghost' | 'soft';
		size?: 'xs' | 'sm';
		active?: boolean;
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	}

	let { href, variant = 'ghost', size = 'xs', active = false, class: className = '', children, ...rest }: Props = $props();

	const tag = $derived(href ? 'a' : rest.onclick ? 'button' : 'span');
</script>

<svelte:element
	this={tag}
	{href}
	type={tag === 'button' ? 'button' : undefined}
	class="chip chip--{variant} chip--{size} {className}"
	class:active
	class:interactive={tag !== 'span'}
	aria-current={active && tag === 'a' ? 'true' : undefined}
	{...rest}
>
	{@render children()}
</svelte:element>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
		text-decoration: none;
		white-space: nowrap;
		transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
	}

	.chip--sm {
		font-size: var(--fs-sm);
	}

	.chip.interactive {
		cursor: pointer;
	}

	.chip.interactive:hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.chip--ghost.active {
		background: var(--surface-3);
		color: var(--text-primary);
	}

	.chip--soft {
		background: var(--surface-1);
		color: var(--text-primary);
	}

	.chip--soft.interactive:hover {
		background: var(--surface-3);
	}

	.chip--soft.active,
	.chip--soft.active:hover {
		background: var(--accent);
	}
</style>
