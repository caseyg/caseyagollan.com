<script lang="ts">
	import Search from './Search.svelte';
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
	const segments = $derived(sections.map(({ id, ...section }) => ({ ...section, current: currentPage === id })));
</script>

<Corner as="nav" side="end" class="site-nav" aria-label="Site">
	<div class="group">
		<SegmentedPill {segments} size="md" compact attached />
		<!-- Search is an action, not a place, so it closes the row in the corner itself. -->
		<Search onResultClick={onSearchResultClick} />
	</div>
</Corner>

<style>
	.group {
		display: flex;
	}
</style>
