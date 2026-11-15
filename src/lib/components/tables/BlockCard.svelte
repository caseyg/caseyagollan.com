<script lang="ts">
	import { blockIcon, KIND_LABEL, type Block } from '$lib/tables';

	interface Props {
		block: Block;
		/**
		 * `tile` fills the box it is given: a block on a table, or a table's thumbnail. Pictures lead
		 * where there is one; text blocks are the site's blue. `row` is a line in a list of results.
		 */
		layout?: 'tile' | 'row';
		/** Draws the tile without its text, for thumbnails too small to read. */
		bare?: boolean;
		class?: string;
	}

	let { block, layout = 'tile', bare = false, class: className = '' }: Props = $props();

	let failed = $state(false);
	const image = $derived(failed ? undefined : block.image);
	const tone = $derived(image ? 'picture' : 'text');
</script>

<article class="block-card block-card--{layout} block-card--{tone} block-card--{block.kind} {className}" class:bare data-kind={block.kind}>
	{#if image}
		<div class="media">
			<img src={image} alt="" loading="lazy" decoding="async" draggable="false" onerror={() => (failed = true)} />
		</div>
	{/if}
	{#if !bare}
		<div class="body">
			<h3 class="title">{block.title}</h3>
			{#if block.meta}<p class="meta">{block.meta}</p>{/if}
			{#if block.excerpt && layout === 'tile' && !image}<p class="excerpt">{block.excerpt}</p>{/if}
		</div>
	{/if}
	<span class="tile" role="img" aria-label={KIND_LABEL[block.kind]} title={KIND_LABEL[block.kind]}>{blockIcon(block)}</span>
</article>

<style>
	.block-card {
		position: relative;
		box-sizing: border-box;
		overflow: hidden;
		color: var(--text-primary);
		font-family: var(--font-sans);
		font-weight: var(--fw-regular);
		line-height: var(--lh-snug);
		text-align: left;
	}

	/* A tile fills its box: a block on the canvas sizes it, and so does a thumbnail. */
	.block-card--tile {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		border-radius: var(--radius-sm);
	}

	.block-card--tile.block-card--text {
		background: var(--accent);
	}

	.block-card--tile.block-card--picture {
		background: var(--surface-sunken);
	}

	.block-card--tile .media {
		flex: 1;
		min-height: 0;
	}

	.media img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top;
	}

	/* A book is its cover: whole, never cropped. */
	.block-card--book .media img {
		object-fit: contain;
		object-position: center;
	}

	.block-card--tile .body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-height: 0;
		padding: var(--space-3);
		padding-right: calc(var(--space-3) + 1.75rem);
	}

	.block-card--tile.block-card--text .body {
		flex: 1;
	}

	.block-card--tile.block-card--picture .body {
		padding: var(--space-2) var(--space-3);
		background: rgb(0 0 0 / 0.35);
	}

	.title {
		margin: 0;
		font-size: var(--fs-base);
		font-weight: var(--fw-semibold);
		line-height: var(--lh-tight);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
	}

	.block-card--picture .title {
		font-size: var(--fs-sm);
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.meta {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.block-card--text .meta {
		color: var(--text-secondary);
	}

	.excerpt {
		flex: 1;
		min-height: 0;
		margin: var(--space-1) 0 0;
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
		overflow: hidden;
		mask-image: linear-gradient(to bottom, black 70%, transparent);
	}

	/* The square emoji tile in the top-right corner, as on the rest of the site. */
	.tile {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-sm);
		background: var(--bg-primary);
		font-size: var(--fs-sm);
		line-height: 1;
	}

	.bare .tile {
		display: none;
	}

	/* A row: a small picture or tile, then the title and its line. */
	.block-card--row {
		display: grid;
		grid-template-columns: 2.75rem 1fr;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
	}

	.block-card--row .media {
		grid-row: 1;
		grid-column: 1;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--surface-sunken);
	}

	.block-card--row .tile {
		position: static;
		grid-row: 1;
		grid-column: 1;
		width: 2.75rem;
		height: 2.75rem;
		background: var(--accent);
		font-size: var(--fs-lg);
	}

	.block-card--row.block-card--picture .tile {
		display: none;
	}

	.block-card--row .body {
		grid-column: 2;
		min-width: 0;
	}

	.block-card--row .title {
		font-size: var(--fs-sm);
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
</style>
