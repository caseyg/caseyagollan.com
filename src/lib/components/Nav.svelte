<script lang="ts">
	import Search from './Search.svelte';
	import SitePalette from './SitePalette.svelte';
	import { Corner, SegmentedPill } from '$lib/components/ui';

	type Section = 'home' | 'library' | 'posts';

	let {
		currentPage,
		onSearchResultClick
	}: {
		/** The section being viewed; its segment is marked. Omit on pages outside all three. */
		currentPage?: Section;
		onSearchResultClick?: (url: URL) => boolean;
	} = $props();

	// The same segments in the same order on every page, so each one stays where it was last time.
	const sections: { id: Section; href: string; label: string; icon: string }[] = [
		{ id: 'home', href: '/', label: 'Home', icon: '👋' },
		{ id: 'library', href: '/library/', label: 'Library', icon: '📚' },
		{ id: 'posts', href: '/posts/', label: 'Posts', icon: '📡' }
	];
	let search: Search | undefined = $state();
	const segments = $derived(sections.map(({ id, ...section }) => ({ ...section, current: currentPage === id })));
</script>

<!--
	The ground behind the top bar where it sits over the page. A real element, not a pseudo-element:
	iOS Safari tints the status bar from a fixed element at the top edge, and ignores generated content.
-->
<div class="top-band" aria-hidden="true"></div>

<Corner as="nav" side="end" class="site-nav" aria-label="Site">
	<div class="group">
		<SegmentedPill {segments} size="md" compact attached />
		<!-- Search is an action, not a place, so it closes the row in the corner itself. -->
		<Search bind:this={search} onResultClick={onSearchResultClick} />
	</div>
</Corner>

<SitePalette onSearch={(query) => search?.openWith(query)} />

<style>
	.group {
		display: flex;
	}

	.top-band {
		display: none;
	}

	@media (max-width: 1360px) {
		:global(body:has(.page)) .top-band {
			display: block;
			position: fixed;
			inset: 0 0 auto;
			z-index: calc(var(--z-sticky) + 1);
			height: var(--sticky-top);
			background: var(--bg-primary);
		}

		/* Content that overscrolls, or that iOS draws under the status bar, stays covered too. */
		.top-band::before {
			content: '';
			position: absolute;
			inset: auto 0 100%;
			height: 100vh;
			background: inherit;
		}
	}
</style>
