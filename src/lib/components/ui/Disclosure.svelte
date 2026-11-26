<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@ui-sdk/svelte/collapsible';
	import Icon from './Icon.svelte';

	interface Props {
		/** Supports bind:open. */
		open?: boolean;
		/** The line that always shows; it gets whether the panel is open. */
		summary: Snippet<[boolean]>;
		/** What opens under it. Without it the summary is plain text, with nothing to press. */
		children?: Snippet;
		/** `line`: a quiet line of text in running copy. `row`: a full-width row, for a list of them. */
		variant?: 'line' | 'row';
		class?: string;
	}

	let { open = $bindable(false), summary, children, variant = 'line', class: className = '' }: Props = $props();
</script>

<!--
	A summary that opens to show more: one level of progressive disclosure. They nest, a line opening
	to rows that open to details. The panel is only in the page while open, so a closed one costs nothing.
-->
{#if children}
	<Collapsible class="disclosure disclosure--{variant} {className}" bind:open>
		<CollapsibleTrigger class="disclosure-summary">
			<span class="disclosure-label">{@render summary(open)}</span>
			<span class="disclosure-mark" aria-hidden="true"><Icon name="chevron" size={12} /></span>
		</CollapsibleTrigger>
		<CollapsiblePanel class="disclosure-panel">{@render children()}</CollapsiblePanel>
	</Collapsible>
{:else}
	<div class="disclosure disclosure--{variant} {className}">
		<div class="disclosure-summary"><span class="disclosure-label">{@render summary(false)}</span></div>
	</div>
{/if}

<style>
	:global(.disclosure) {
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	:global(.disclosure-summary) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		max-width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
	}

	:global(button.disclosure-summary) {
		cursor: pointer;
		transition: color var(--duration) var(--ease);
	}

	:global(button.disclosure-summary:hover) {
		color: var(--text-secondary);
	}

	:global(button.disclosure-summary:focus-visible) {
		outline: var(--focus-ring);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	:global(.disclosure-label) {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	/* Points right while closed, down once open. */
	:global(.disclosure-mark) {
		display: inline-flex;
		flex-shrink: 0;
		rotate: -90deg;
		transition: rotate var(--duration) var(--ease);
	}

	:global(.disclosure-summary[data-open] .disclosure-mark) {
		rotate: 0deg;
	}

	:global(.disclosure--row > .disclosure-summary) {
		display: flex;
		width: 100%;
		box-sizing: border-box;
		padding: var(--space-2) var(--space-3);
	}

	:global(.disclosure--line > .disclosure-panel) {
		margin-top: var(--space-2);
	}

	:global(.disclosure--row > .disclosure-panel) {
		padding: 0 var(--space-3) var(--space-3);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.disclosure-mark) { transition: none; }
	}
</style>
