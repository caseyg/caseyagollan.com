<script lang="ts">
	import Search from './Search.svelte';

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
</script>

<nav class="site-nav" aria-label="Site">
	<Search onResultClick={onSearchResultClick} />
	{#each sections as section (section.id)}
		<a href={section.href} class="segment" aria-label={section.label} aria-current={currentPage === section.id ? 'true' : undefined}>
			<span aria-hidden="true">{section.icon}</span>
			<span class="label" aria-hidden="true">{section.label}</span>
		</a>
	{/each}
</nav>

<style>
	/* One button group in the corner, the same size and shape as a page's trail. */
	.site-nav {
		position: fixed;
		top: var(--nav-inset);
		right: var(--nav-inset);
		z-index: var(--z-nav);
		display: flex;
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		letter-spacing: 0.01em;
	}

	.segment {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--nav-height);
		padding: 0 var(--space-3);
		background-color: var(--segment);
		box-shadow: inset 1px 0 0 var(--segment-divider);
		color: var(--text-primary);
		text-decoration: none;
		white-space: nowrap;
		transition: background-color var(--duration) var(--ease);
	}

	.segment:last-child {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}

	/* You are here: the full accent. */
	.segment[aria-current] {
		background-color: var(--segment-current);
	}

	.segment:focus-visible {
		outline-offset: -2px;
	}

	@media (hover: hover) and (pointer: fine) {
		.segment:not([aria-current]):hover {
			background-color: var(--segment-hover);
		}
	}

	/* On a phone the emoji stand alone, leaving the row to the page. */
	@media (max-width: 600px) {
		.site-nav {
			font-size: var(--fs-lg);
		}

		.label {
			display: none;
		}
	}
</style>
