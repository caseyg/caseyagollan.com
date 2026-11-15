<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Checkbox } from '@ui-sdk/svelte/checkbox';

	interface Props {
		/** A link to the page with this choice switched, so it works without JavaScript. Otherwise a checkbox. */
		href?: string;
		/** Whether the choice is on. Bind it for a checkbox outside a `CheckboxGroup`; leave it out inside one. */
		pressed?: boolean;
		/** Form field name; a checked chip submits `value`. Inside a group, the group's value lists it. */
		name?: string;
		value?: string;
		disabled?: boolean;
		/** Tooltip, such as "Also post to Bluesky". */
		title?: string;
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
	}

	let { href, pressed = $bindable(), name, value, disabled = false, title, onclick, children }: Props = $props();
</script>

<!-- A pill that turns a choice on or off: post types in a feed filter, destinations in the composer. -->
{#if href}
	<a class="toggle-chip" data-pressed={pressed || undefined} {href} {title} {onclick}>
		{@render children()}{#if pressed}<span class="visually-hidden">, selected</span>{/if}
	</a>
{:else if pressed === undefined}
	<!-- In a CheckboxGroup, the group decides. -->
	<Checkbox class="toggle-chip" {name} {value} {disabled} {title}>{@render children()}</Checkbox>
{:else}
	<Checkbox class="toggle-chip" bind:checked={pressed} {name} {value} {disabled} {title}>{@render children()}</Checkbox>
{/if}

<style>
	:global(.toggle-chip) {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		letter-spacing: 0.02em;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), color var(--duration) var(--ease), scale 160ms var(--ease-out);
	}

	:global(.toggle-chip:active:not([data-disabled])) {
		scale: 0.97;
	}

	:global(.toggle-chip[data-pressed]),
	:global(.toggle-chip[data-checked]) {
		border-color: var(--border-strong);
		background: var(--surface-3);
		color: var(--text-primary);
	}

	@media (hover: hover) {
		:global(.toggle-chip:hover:not([data-disabled])) {
			border-color: var(--border-strong);
			color: var(--text-primary);
		}

		:global(.toggle-chip[data-pressed]:hover),
		:global(.toggle-chip[data-checked]:hover) {
			background: var(--surface-2);
		}
	}

	:global(.toggle-chip[data-disabled]) {
		opacity: 0.5;
		cursor: default;
	}

	@media (forced-colors: active) {
		:global(.toggle-chip[data-pressed]),
		:global(.toggle-chip[data-checked]) {
			border: 2px solid CanvasText;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.toggle-chip:active:not([data-disabled])) {
			scale: none;
		}
	}
</style>
