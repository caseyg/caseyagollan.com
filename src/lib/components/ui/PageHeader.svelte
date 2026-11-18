<script lang="ts">
	import type { Snippet } from 'svelte';
	import Corner from './Corner.svelte';
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
		/** A small control for the whole page, such as Subscribe, pinned in the trail's corner just after it. */
		pinned?: Snippet;
		description?: string;
		/** Less space below, for pages whose first section brings its own. */
		tight?: boolean;
	}

	let { trail, title, children, actions, pinned, description, tight = false }: Props = $props();
</script>

<header class="page-header" class:tight class:bare={!actions && !children && !description}>
	<div class="bar" class:solo={!actions}>
		<!-- Pinned top-left, opposite the site navigation, in the quiet tone so it reads as part of the page. -->
		<Corner as="nav" side="start" class="trail" aria-label="Breadcrumb">
			<SegmentedPill segments={trail} size="md" tone="quiet" compact />
			{#if pinned}<div class="pinned">{@render pinned()}</div>{/if}
		</Corner>
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

	.bar > :global(*) {
		grid-area: 1 / 1;
		min-width: 0;
	}

	/* With the trail pinned away and no control beside it, the row takes up no space. */
	.bar.solo {
		display: contents;
	}

	.page-header.bare {
		margin-bottom: 0;
	}

	/* Keeps its size: the trail's titles give way first. */
	.pinned {
		display: flex;
		flex: none;
	}

	.description {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}

</style>
