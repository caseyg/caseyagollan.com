<script lang="ts">
	import type { Snippet } from 'svelte';
	import SegmentedPill, { type Segment } from './SegmentedPill.svelte';

	interface Props {
		/** The path to this page, outermost first. Each segment links up a level; the last may be the page itself. */
		trail: Segment[];
		/** Names the page for assistive technology when the trail is its only visible title. */
		title?: string;
		/** A visible title beneath the trail, for pages that need one. */
		children?: Snippet;
		/** A control for the page, set at the end of the trail's row. */
		actions?: Snippet;
		description?: string;
		/** Less space below, for pages whose first section brings its own. */
		tight?: boolean;
	}

	let { trail, title, children, actions, description, tight = false }: Props = $props();
</script>

<header class="page-header" class:tight>
	<div class="bar">
		<nav class="trail" aria-label="Breadcrumb">
			<SegmentedPill segments={trail} size="md" />
		</nav>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
	{#if children}
		{@render children()}
	{:else if title}
		<h1 class="visually-hidden">{title}</h1>
	{/if}
	{#if description}
		<p class="description">{description}</p>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.page-header.tight {
		margin-bottom: var(--space-5);
	}

	/*
	 * The trail and the page's control share one row. They are stacked in a single grid cell so a
	 * control that opens (the post filter) can grow downwards across the full width beneath the trail.
	 */
	.bar {
		display: grid;
	}

	.trail,
	.actions {
		grid-area: 1 / 1;
		min-width: 0;
	}

	.trail {
		/* Above the feed's sticky date pills, so a segment's menu opens over them. */
		z-index: var(--z-menu);
		display: flex;
		justify-self: start;
		align-self: start;
	}

	.description {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
