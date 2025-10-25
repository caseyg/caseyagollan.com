<script lang="ts">
	let {
		currentPage = 'home',
		showPostsLink = false
	}: {
		currentPage?: 'home' | 'library' | 'posts';
		showPostsLink?: boolean;
	} = $props();
</script>

<div class="nav-toggles">
	{#if currentPage !== 'home'}
		<a href="/">👋</a>
	{/if}
	{#if currentPage !== 'library'}
		<a href="/library/">📚</a>
	{/if}
	{#if currentPage !== 'posts' || showPostsLink}
		<a href="/posts/">📡</a>
	{/if}
</div>

<style>
	.nav-toggles {
		position: fixed;
		top: 5px;
		right: 5px;
		display: flex;
		gap: 5px;
		z-index: 1000;
	}

	.nav-toggles a {
		background-color: blue;
		border: none;
		color: white;
		text-align: center;
		text-decoration: none;
		display: block;
		width: auto;
		font-size: 2rem;
		height: auto;
		border-radius: 5px;
		cursor: pointer;
		padding: 0 10px;
		line-height: 1.5;
	}

	.nav-toggles a:hover {
		background-color: rgb(73, 73, 255);
	}
</style>
