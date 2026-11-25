<script lang="ts">
	import Search from './Search.svelte';
	import SitePalette from './SitePalette.svelte';
	import { Corner, SegmentedPill } from '$lib/components/ui';
	import { onMount } from 'svelte';
	import { ownerSignedIn } from '$lib/owner';
	import { visibleSections, type Section } from '$lib/site-sections';

	let {
		currentPage,
		onSearchResultClick,
		condensed: forceCondensed = false
	}: {
		/** The section being viewed; its segment is marked. Omit on pages outside all of them. */
		currentPage?: Section;
		onSearchResultClick?: (url: URL) => boolean;
		/** Always show the condensed menu, as the nav does by itself when a page's trail needs the room. */
		condensed?: boolean;
	} = $props();

	let search: Search | undefined = $state();
	// Set by the corner when the full row would leave a page's trail too little room, as on a phone.
	let crowded = $state(false);
	const condensed = $derived(forceCondensed || crowded);
	// Owner-only sections (Chat, for now) appear once the owner's session is confirmed.
	let owner = $state(false);
	onMount(() => { ownerSignedIn().then((signedIn) => (owner = signedIn)); });
	const sections = $derived(visibleSections(owner || currentPage === 'chat'));
	const segments = $derived(sections.map(({ id, ...section }) => ({ ...section, current: currentPage === id })));

	// Condensed, the sections fold into one menu that names the section being viewed.
	const current = $derived(sections.find(({ id }) => id === currentPage));
	const menu = $derived([
		{
			label: current?.label ?? 'Menu',
			icon: current?.icon,
			current: Boolean(current),
			menuAlign: 'end' as const,
			menuActive: currentPage ?? '',
			menu: sections.map(({ id, href, label, icon }) => ({ value: id, href, label, icon }))
		}
	]);
</script>

<!--
	The ground behind the top bar where it sits over the page. A real element, not a pseudo-element:
	iOS Safari tints the status bar from a fixed element at the top edge, and ignores generated content.
-->
<div class="top-band" aria-hidden="true"></div>

<Corner as="nav" side="end" class="site-nav" aria-label="Site" bind:crowded>
	<div class="group">
		{#if condensed}
			<SegmentedPill segments={menu} size="md" attached />
		{:else}
			<SegmentedPill {segments} size="md" compact attached />
		{/if}
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
