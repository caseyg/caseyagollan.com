<script lang="ts">
	import Search from './Search.svelte';

	type Section = 'home' | 'library' | 'posts';

	let {
		currentPage,
		onSearchResultClick
	}: {
		/** The section being viewed; its tile is marked. Omit on pages outside all three. */
		currentPage?: Section;
		onSearchResultClick?: (url: URL) => boolean;
	} = $props();

	// The same tiles in the same order on every page, so each one stays where it was last time.
	const sections: { id: Section; href: string; label: string; icon: string }[] = [
		{ id: 'home', href: '/', label: 'Home', icon: '👋' },
		{ id: 'library', href: '/library/', label: 'Library', icon: '📚' },
		{ id: 'posts', href: '/posts/', label: 'Posts', icon: '📡' }
	];
</script>

<nav class="site-nav" aria-label="Site">
	<Search onResultClick={onSearchResultClick} />
	{#each sections as section (section.id)}
		<a href={section.href} class="tile" aria-label={section.label} aria-current={currentPage === section.id ? 'true' : undefined}>
			<span aria-hidden="true">{section.icon}</span>
			<span class="label" aria-hidden="true">{section.label}</span>
		</a>
	{/each}
</nav>

<style>
	.site-nav {
		position: fixed;
		top: var(--nav-inset);
		right: var(--nav-inset);
		display: flex;
		gap: var(--nav-inset);
		z-index: var(--z-nav);
	}

	.tile {
		position: relative;
		display: grid;
		place-items: center;
		width: var(--nav-tile);
		height: var(--nav-tile);
		background-color: var(--accent);
		color: var(--text-primary);
		font-size: calc(var(--nav-tile) * 0.667);
		line-height: 1;
		text-decoration: none;
		transition: background-color var(--duration) var(--ease), transform 160ms var(--ease-out);
	}

	.tile:active {
		transform: scale(0.96);
	}

	/* You are here: a lighter tile with a white rule along its foot. */
	.tile[aria-current] {
		background-color: var(--accent-hover);
		box-shadow: inset 0 -3px 0 var(--text-primary);
	}

	/* The name of each tile, shown beneath it on hover or keyboard focus. */
	.label {
		position: absolute;
		top: calc(100% + var(--nav-inset));
		right: 0;
		padding: var(--space-1) var(--space-2);
		background: var(--accent);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		letter-spacing: 0.02em;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transform: translateY(-2px);
		transition: opacity 100ms var(--ease-out), transform 100ms var(--ease-out);
	}

	.tile:focus-visible .label {
		opacity: 1;
		transform: none;
	}

	@media (hover: hover) and (pointer: fine) {
		.tile:hover {
			background-color: var(--accent-hover);
		}

		.tile:hover .label {
			opacity: 1;
			transform: none;
			transition-duration: 150ms;
			transition-delay: 250ms;
		}
	}
</style>
