<script lang="ts" module>
	/** The corner of the page a floating button is pinned to; `top-right` sits just under the site navigation. */
	export type FloatingCorner = 'bottom-left' | 'bottom-right' | 'top-right';
</script>

<script lang="ts">
	import Button from './Button.svelte';
	import type { IconName } from './Icon.svelte';

	interface Props {
		icon: IconName;
		/** Accessible name and tooltip. */
		label: string;
		/** Pinned to this corner of the page. Leave out to show the button in place. */
		corner?: FloatingCorner;
		/** For a button that shows or hides something: whether it is showing. */
		pressed?: boolean;
		/** A pulsing dot on the button's shoulder, while what it opens is working. */
		busy?: boolean;
		busyLabel?: string;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		[key: string]: unknown;
	}

	let { icon, label, corner, pressed, busy = false, busyLabel = 'working', onclick, class: className = '', ...rest }: Props = $props();
</script>

<!--
	A round button that floats over a corner of the page, inset like the site navigation: the sound
	switch at bottom left, the chat at bottom right. One size, one icon weight, one outline, so the
	corners match. Gray, since it controls the page rather than going somewhere.
-->
<span class="floating-button {className}" data-corner={corner}>
	<Button variant="icon" {icon} {label} {pressed} {onclick} {...rest} />
	{#if busy}<span class="floating-button-dot" role="status" aria-label={busyLabel}></span>{/if}
</span>

<style>
	.floating-button {
		position: relative;
		display: inline-flex;
		/* Its own type size, whatever the page around it uses (a table's page is scaled for its canvas). */
		font-size: var(--fs-base);
	}

	.floating-button :global(.button--icon) {
		width: 2.75rem;
		height: 2.75rem;
		border-color: var(--border);
		background: var(--bg-primary);
		box-shadow: 0 2px 10px rgb(0 0 0 / 0.14);
	}

	@media (hover: hover) {
		.floating-button :global(.button--icon:hover:not([data-disabled])) {
			border-color: var(--border-strong);
			/* The page shows through a surface tint, so the hover colour is laid over the page colour. */
			background: linear-gradient(var(--surface-2), var(--surface-2)), var(--bg-primary);
		}
	}

	.floating-button-dot {
		position: absolute;
		top: 0.3rem;
		right: 0.3rem;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--text-primary);
		animation: floating-button-pulse 1.2s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes floating-button-pulse {
		50% {
			opacity: 0.3;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.floating-button-dot {
			animation: none;
		}
	}

	[data-corner] {
		position: fixed;
		z-index: var(--z-nav);
	}

	[data-corner$='left'] {
		left: calc(var(--nav-inset) + env(safe-area-inset-left));
	}

	[data-corner$='right'] {
		right: calc(var(--nav-inset) + env(safe-area-inset-right));
	}

	[data-corner^='bottom'] {
		bottom: calc(var(--nav-inset) + env(safe-area-inset-bottom));
	}

	[data-corner^='top'] {
		top: calc(var(--nav-lane) + var(--nav-inset));
	}

	/* Just above the chat's folded bottom sheet on phones, and under it when it's pulled up. */
	:global(html[data-chat-dock='sheet']) [data-corner^='bottom'] {
		bottom: calc(var(--chat-sheet-rest, 0px) + var(--nav-inset));
		z-index: calc(var(--z-menu) - 1);
	}
</style>
