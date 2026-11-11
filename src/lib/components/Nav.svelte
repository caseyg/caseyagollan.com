<script lang="ts">
	import Search from './Search.svelte';
	let {
		currentPage = 'home',
		showPostsLink = false,
		onSearchResultClick
	}: {
		currentPage?: 'home' | 'library' | 'posts';
		showPostsLink?: boolean;
		onSearchResultClick?: (url: URL) => boolean;
	} = $props();
</script>

<nav class="nav-toggles" aria-label="Site">
	<Search onResultClick={onSearchResultClick} />
	{#if currentPage !== 'home'}
		<a href="/" aria-label="Home" title="Home"><span aria-hidden="true">👋</span></a>
	{/if}
	{#if currentPage !== 'library'}
		<a href="/library/" aria-label="Library" title="Library"><span aria-hidden="true">📚</span></a>
	{/if}
	{#if currentPage !== 'posts' || showPostsLink}
		<a href="/posts/" aria-label="Posts" title="Posts"><span aria-hidden="true">📡</span></a>
	{/if}
</nav>

<style>
	.nav-toggles {
		position: fixed;
		top: 5px;
		right: 5px;
		display: flex;
		gap: 5px;
		z-index: var(--z-nav);
	}

	.nav-toggles a {
		background-color: var(--accent);
		border: none;
		color: white;
		text-align: center;
		text-decoration: none;
		display: block;
		width: auto;
		font-size: 2rem;
		height: auto;
		border-radius: 0;
		cursor: pointer;
		padding: 0 10px;
		line-height: 1.5;
		transition: background-color var(--duration) var(--ease);
	}

	.nav-toggles a:hover {
		background-color: var(--accent-hover);
	}
</style>
