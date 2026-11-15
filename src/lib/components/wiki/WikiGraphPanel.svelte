<script lang="ts">
	import { Heading } from '$lib/components/ui';
	import type { GraphLayout } from '$lib/wiki/graph-layout';
	import WikiGraph from './WikiGraph.svelte';

	interface Props {
		layout: GraphLayout;
		/** The page being read. */
		current?: string;
		title?: string;
		/** Where the whole graph is, when this shows part of it. */
		moreHref?: string;
		labels?: 'all' | 'auto';
	}

	let { layout, current, title = 'Linked pages', moreHref, labels = 'auto' }: Props = $props();
	const id = $props.id();
</script>

<!-- A page's neighbourhood in the wiki, for the column beside it. -->
<section class="wiki-graph-panel" aria-labelledby={id}>
	<div class="head">
		<Heading level={2} size="label" {id}>{title}</Heading>
		{#if moreHref}<a href={moreHref}>Whole wiki →</a>{/if}
	</div>
	<WikiGraph {layout} {current} {labels} label={title} />
</section>

<style>
	.wiki-graph-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-2);
	}

	.head a {
		color: var(--text-muted);
		font-size: var(--fs-xs);
		text-decoration: none;
		transition: color var(--duration) var(--ease);
	}

	.head a:hover {
		color: var(--text-primary);
	}
</style>
