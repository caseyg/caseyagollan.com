<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** A quieter line under the title. */
		detail?: string;
		/** Makes the whole row a link, with an arrow at its end. */
		href?: string;
		/** More under the title than `detail` can hold. */
		children?: Snippet;
		/** The row's control, at its end. */
		action?: Snippet;
		[key: string]: unknown;
	}

	let { title, detail, href, children, action, ...rest }: Props = $props();
</script>

{#snippet text()}
	<span class="row-text">
		<span class="row-title">{title}</span>
		{#if detail}<span class="row-detail">{detail}</span>{/if}
		{#if children}<span class="row-detail">{@render children()}</span>{/if}
	</span>
{/snippet}

<li class="row">
	{#if href}
		<a class="row-body row-link" {href} {...rest}>{@render text()}<span class="row-arrow" aria-hidden="true">→</span></a>
	{:else}
		<div class="row-body">{@render text()}{#if action}<span class="row-action">{@render action()}</span>{/if}</div>
	{/if}
</li>

<style>
	.row {
		border-top: 1px solid var(--border-subtle);
	}

	.row-body {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) 0;
		color: inherit;
		text-decoration: none;
	}

	.row-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.row-title {
		font-weight: var(--fw-medium);
		overflow-wrap: anywhere;
	}

	.row-detail {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}

	.row-action {
		flex: none;
	}

	.row-arrow {
		flex: none;
		color: var(--text-muted);
		transition: translate 160ms var(--ease-out), color var(--duration) var(--ease);
	}

	.row-link:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	@media (hover: hover) {
		.row-link:hover .row-title {
			text-decoration: underline;
			text-decoration-thickness: from-font;
			text-underline-offset: var(--underline-offset);
		}

		.row-link:hover .row-arrow {
			translate: 3px 0;
			color: var(--text-primary);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.row-arrow {
			transition: none;
		}
	}
</style>
