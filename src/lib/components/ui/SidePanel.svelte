<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';

	interface Props {
		/** Names the panel for assistive technology. */
		label: string;
		/** Shows the close button, top right. */
		onclose?: () => void;
		closeLabel?: string;
		/** Tighter padding, with rules under the header and over the footer, for a panel that is a tool (a chat) rather than a page of details. */
		compact?: boolean;
		/** A window floating over the bottom right corner of the page instead of a panel down its side; the page keeps its full width. */
		floating?: boolean;
		/** Which side of the page it stands on. A panel on the left leaves the right to another (the docked chat). */
		side?: 'right' | 'left';
		/** Beside the close button: the panel's title. */
		header?: Snippet;
		/** Small buttons before the close button. */
		actions?: Snippet;
		/** Stays at the bottom while the body scrolls. */
		footer?: Snippet;
		children?: Snippet;
		class?: string;
		[key: string]: unknown;
	}

	let { label, onclose, closeLabel = 'Close', compact = false, floating = false, side = 'right', header, actions, footer, children, class: className = '', ...rest }: Props = $props();
</script>

<!--
	A panel down the right side of the page, beneath the site navigation and inset like it, so the
	navigation stays whole while the panel is open. The body scrolls; the header and footer stay.
	The library's book details and the docked chat are both one of these. On a phone it lies along
	the bottom instead. `floating` makes it a window over the bottom right corner. Set `--side-panel-width` to change its width; a panel that should stand
	beside another reads `--side-panel-offset`. `side="left"` stands it down the left side instead.
-->
<aside class="side-panel {className}" class:compact class:floating class:left={side === 'left'} aria-label={label} {...rest}>
	{#if header || actions || onclose}
		<header class="side-panel-header">
			<div class="side-panel-title">{@render header?.()}</div>
			{#if actions}<div class="side-panel-actions">{@render actions()}</div>{/if}
			{#if onclose}<Button variant="primary" size="sm" icon="close" class="side-panel-close" label={closeLabel} aria-label={closeLabel} onclick={onclose} />{/if}
		</header>
	{/if}
	<div class="side-panel-body">{@render children?.()}</div>
	{#if footer}<footer class="side-panel-footer">{@render footer()}</footer>{/if}
</aside>

<style>
	.side-panel {
		--side-panel-pad: var(--space-5);
		position: fixed;
		z-index: var(--z-menu);
		top: calc(var(--nav-lane) + var(--nav-inset));
		right: calc(var(--nav-inset) + var(--side-panel-offset, 0px) + env(safe-area-inset-right));
		bottom: calc(var(--nav-inset) + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		width: var(--side-panel-width, 20rem);
		max-width: calc(100vw - 2 * var(--nav-inset));
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--bg-primary) 60%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		color: var(--text-primary);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}

	.compact {
		--side-panel-pad: var(--space-3);
	}

	.left:not(.floating) {
		right: auto;
		left: calc(var(--nav-inset) + var(--side-panel-offset, 0px) + env(safe-area-inset-left));
	}

	/* A window over the page's corner: solid enough to read over whatever is under it, and lifted off it. */
	.floating {
		top: auto;
		right: calc(var(--nav-inset) + var(--space-3) + env(safe-area-inset-right));
		bottom: calc(var(--nav-inset) + var(--space-3) + env(safe-area-inset-bottom));
		height: min(var(--side-panel-height, 38rem), calc(100dvh - var(--nav-lane) - 2 * var(--nav-inset) - 2 * var(--space-3)));
		border-color: var(--border);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
		box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.3);
		overflow: hidden;
	}

	.side-panel-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--side-panel-pad) var(--side-panel-pad) 0;
	}

	.compact .side-panel-header {
		align-items: center;
		padding: var(--space-2) var(--space-2) var(--space-2) var(--side-panel-pad);
		border-bottom: 1px solid var(--border-subtle);
	}

	.side-panel-title {
		flex: 1;
		min-width: 0;
	}

	.side-panel-actions {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: var(--space-1);
	}

	/* A square of the navigation's blue: closing is leaving, like the buttons above it. */
	.side-panel :global(.side-panel-close) {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		padding: 0;
	}

	.side-panel-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--side-panel-pad);
	}

	.side-panel-header + .side-panel-body {
		padding-top: var(--space-2);
	}

	.side-panel-footer {
		padding: var(--side-panel-pad);
	}

	.compact .side-panel-footer {
		padding: var(--space-2);
		border-top: 1px solid var(--border-subtle);
	}

	/* On a phone: along the bottom, at most half the screen, so what it describes stays in view above. */
	@media (max-width: 600px) {
		.side-panel {
			/* Over the page's floating buttons, which would sit on its text. */
			z-index: calc(var(--z-nav) + 1);
			top: auto;
			right: 0;
			left: 0;
			bottom: 0;
			width: 100%;
			max-width: none;
			max-height: 50vh;
			padding-bottom: env(safe-area-inset-bottom);
			border: 0;
			border-top: 1px solid var(--border);
			border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		}
	}
</style>
