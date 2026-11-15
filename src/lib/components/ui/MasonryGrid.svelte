<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	interface Props {
		items: T[];
		/** A stable key for each item. */
		key: (item: T) => string;
		item: Snippet<[T, number]>;
		/** Narrowest a column may be on wide screens; the grid fits as many as the width allows. */
		minColumnWidth?: string;
		/** Narrowest a column may be on phones, so they still get two columns. */
		minColumnWidthNarrow?: string;
		/** Names the list for assistive technology. */
		label?: string;
		class?: string;
	}

	let { items, key, item, minColumnWidth = '15rem', minColumnWidthNarrow = '9rem', label, class: className = '' }: Props = $props();

	/** Height of one grid row track, in pixels. Items span as many tracks as their height needs. */
	const TRACK = 4;

	let grid: HTMLUListElement;
	let ready = $state(false);

	onMount(() => {
		// Browsers with native masonry lay the items out themselves.
		if (CSS.supports('grid-template-rows', 'masonry')) return;

		const gap = () => parseFloat(getComputedStyle(grid).columnGap) || 0;
		const place = (cell: HTMLElement) => {
			const content = cell.firstElementChild as HTMLElement | null;
			if (!content) return;
			const span = Math.max(1, Math.ceil((content.getBoundingClientRect().height + gap()) / TRACK));
			cell.style.gridRowEnd = `span ${span}`;
		};

		// Each item's content is measured as it loads or resizes, so the columns stay packed.
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) place((entry.target as HTMLElement).parentElement as HTMLElement);
		});
		const observe = () => {
			for (const cell of grid.children) {
				const content = cell.firstElementChild;
				if (content) observer.observe(content);
				place(cell as HTMLElement);
			}
		};
		observe();
		ready = true;

		// New items (a longer list, a filter change) are observed too.
		const mutations = new MutationObserver(observe);
		mutations.observe(grid, { childList: true });

		return () => {
			observer.disconnect();
			mutations.disconnect();
		};
	});
</script>

<!--
	A waterfall of items in columns of equal width. Without script the items sit in plain rows; with it,
	each spans grid rows in proportion to its height, so the columns pack like a masonry wall while the
	order still reads left to right.
-->
<ul
	bind:this={grid}
	class="masonry {className}"
	class:masonry--ready={ready}
	aria-label={label}
	style:--masonry-min={minColumnWidth}
	style:--masonry-min-narrow={minColumnWidthNarrow}
	style:--masonry-track="{TRACK}px"
>
	{#each items as entry, index (key(entry))}
		<li class="masonry-item"><div class="masonry-content">{@render item(entry, index)}</div></li>
	{/each}
</ul>

<style>
	.masonry {
		--masonry-gap: var(--space-3);
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(var(--masonry-min), 100%), 1fr));
		gap: var(--masonry-gap);
		align-items: start;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Each item spans tracks for its height plus the gap below it. */
	.masonry--ready {
		grid-auto-rows: var(--masonry-track);
		row-gap: 0;
	}

	.masonry-item {
		min-width: 0;
	}

	@supports (grid-template-rows: masonry) {
		.masonry {
			grid-template-rows: masonry;
		}
	}

	@media (max-width: 600px) {
		.masonry {
			--masonry-gap: var(--space-2);
			grid-template-columns: repeat(auto-fill, minmax(min(var(--masonry-min-narrow), 100%), 1fr));
		}
	}
</style>
