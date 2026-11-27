<script lang="ts">
	import { blockIcon, KIND_LABEL, type Block } from '$lib/tables';
	import { CARD_QUOTE_LINES, CARD_TITLE_LINES } from '$lib/table-card';

	interface Props {
		block: Block;
		/** Shows where the page is from and the kind tile in the corner. */
		details?: boolean;
	}

	let { block, details = true }: Props = $props();

	let failed = $state(false);
	let loaded = $state(false);
	/** A picture already in the cache shows at once; others fade in as they arrive. */
	function arrive(img: HTMLImageElement) {
		if (img.complete && img.naturalWidth) loaded = true;
	}
	const image = $derived(failed ? undefined : block.image);
	/** The site, for the title tile: the first part of the source line, without a path or `www.`. */
	const site = $derived((block.meta ?? '').split(' · ')[0] || (() => { try { return new URL(block.url).hostname.replace(/^www\./, ''); } catch { return ''; } })());
</script>

<!-- A saved page on a map: its picture, or a tile set in type when it has none worth showing (or the
     picture is of a person); its title; one quote in the page's own words; and where it is from.
     A quote Casey highlighted is marked as one. Heights come from `cardSize`, which counts the same lines. -->
<article class="source-card" class:plain={!details} class:tiled={!image} data-kind={block.kind} style:--title-lines={CARD_TITLE_LINES} style:--quote-lines={CARD_QUOTE_LINES}>
	<div class="media">
		{#if image}
			<img src={image} alt="" loading="lazy" decoding="async" draggable="false" class:loaded use:arrive onload={() => (loaded = true)} onerror={() => (failed = true)} />
		{:else}
			<p class="tile-name" aria-hidden="true">{site || block.title}</p>
		{/if}
		{#if details}<span class="kind" role="img" aria-label={KIND_LABEL[block.kind]} title={KIND_LABEL[block.kind]}>{blockIcon(block)}</span>{/if}
	</div>
	<div class="body">
		<h3 class="title">{block.title}</h3>
		{#if block.quote}
			<blockquote class="quote" class:marked={block.marked}>
				{#if block.marked}<span class="visually-hidden">Highlighted: </span>{/if}<span class="words">{block.quote}</span>
			</blockquote>
		{/if}
		{#if block.meta && details}<p class="meta">{block.meta}</p>{/if}
	</div>
</article>

<style>
	.source-card {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: var(--radius-sm);
		background: var(--bg-primary);
		box-shadow: inset 0 0 0 1px var(--border);
		color: var(--text-primary);
		font-family: var(--font-sans);
		text-align: left;
	}

	/* Two to one, whatever the card's height: the same shape as the pictures kept for maps. */
	.media {
		position: relative;
		flex: none;
		aspect-ratio: 2 / 1;
		overflow: hidden;
		background: var(--surface-sunken);
	}

	.media img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		transition: opacity var(--duration) ease-out;
	}

	.media img.loaded {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.media img {
			transition: none;
		}
	}

	/* The title tile: the site's name set large on the site's blue, where a picture would be. */
	.tiled .media {
		display: grid;
		align-items: end;
		padding: var(--space-3);
		background: var(--accent);
	}

	.tile-name {
		margin: 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-semibold);
		line-height: var(--lh-tight);
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
	}

	.kind {
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

	.body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 0;
		padding: var(--space-3);
	}

	.title {
		margin: 0;
		font-size: var(--fs-base);
		font-weight: var(--fw-semibold);
		line-height: 20px;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: var(--title-lines);
		line-clamp: var(--title-lines);
		overflow: hidden;
	}

	.quote {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: 19px;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: var(--quote-lines);
		line-clamp: var(--quote-lines);
		overflow: hidden;
	}

	.words::before {
		content: '“';
	}

	.words::after {
		content: '”';
	}

	/* Casey's own highlight: marked as a highlighter marks, in the site's blue. */
	.quote.marked .words {
		background: var(--accent);
		color: var(--text-primary);
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
		padding: 1px 2px;
	}

	.meta {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: 18px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
