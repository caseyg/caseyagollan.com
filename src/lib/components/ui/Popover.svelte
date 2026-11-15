<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/svelte/popover';

	interface Props {
		/** Content of the trigger button. Leave it out and pass `anchor` to open the panel from code with `open`. */
		trigger?: Snippet;
		/** Positions the panel against this instead of the trigger, such as a right-click's `{ x, y }`. */
		anchor?: { x: number; y: number } | HTMLElement | null;
		/** Panel content: links or a short form. For a list of pages to switch between, use `SelectMenu`. */
		children: Snippet;
		/** Names the trigger and the panel. Shown as the panel's heading unless `hideTitle`. */
		label: string;
		hideTitle?: boolean;
		/** Which edge of the trigger the panel lines up with. */
		align?: 'start' | 'end';
		open?: boolean;
		/** Classes for the caller's sizing of the trigger and panel (use `:global`). */
		triggerClass?: string;
		panelClass?: string;
	}

	let { trigger, anchor, children, label, hideTitle = true, align = 'start', open = $bindable(false), triggerClass = '', panelClass = '' }: Props = $props();

	// Following a link inside the panel closes it, as leaving the page would.
	function onPanelClick(event: MouseEvent) {
		if ((event.target as Element).closest('a[href]')) open = false;
	}
</script>

<Popover bind:open>
	{#if trigger}<PopoverTrigger class="popover-trigger {triggerClass}" aria-label={label} title={label}>{@render trigger()}</PopoverTrigger>{/if}
	<PopoverContent class="popover-panel {panelClass}" side="bottom" {align} sideOffset={4} collisionPadding={8} anchor={anchor ?? undefined} finalFocus={trigger ? undefined : 'none'} onclick={onPanelClick}>
		<PopoverTitle class={hideTitle ? 'visually-hidden' : 'popover-title'}>{label}</PopoverTitle>
		{@render children()}
	</PopoverContent>
</Popover>

<style>
	:global(.popover-trigger) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2);
		border: 0;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		line-height: var(--lh-snug);
		cursor: pointer;
		transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
	}

	:global(.popover-trigger:hover),
	:global(.popover-trigger[data-open]) {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	:global(.popover-panel) {
		box-sizing: border-box;
		max-height: min(70vh, var(--available-height));
		margin: 0;
		padding: var(--space-1);
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-primary);
		color: var(--text-primary);
		/* The panel renders where it is declared, so reset type a page may have enlarged. */
		font-size: var(--fs-base);
		line-height: var(--lh-normal);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
		transform-origin: var(--transform-origin);
		transition: opacity 150ms var(--ease-out), scale 150ms var(--ease-out);
	}

	:global(.popover-panel[data-starting-style]),
	:global(.popover-panel[data-ending-style]) {
		opacity: 0;
		scale: 0.97;
	}

	:global(.popover-title) {
		margin: var(--space-2);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.popover-panel) {
			transition: none;
		}
	}
</style>
