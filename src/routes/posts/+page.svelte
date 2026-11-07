<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostCard, DateHeader, PostsLayout } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Posts{data.page > 1 ? ` - Page ${data.page}` : ''} - Casey Gollan</title>
	<meta name="description" content="Posts, notes, and bookmarks by Casey Gollan" />
	<meta property="og:title" content="Posts - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<div class="posts-list h-feed">
		{#each data.postsByDay as [dateKey, postsForDay] (dateKey)}
			<DateHeader {dateKey} />

			{#each postsForDay as post (post.slug)}
				<PostCard {post} />
			{/each}
		{/each}
	</div>
	{#if data.totalPages > 1}
		<nav class="pagination" aria-label="Posts pagination">
			<div>
				{#if data.page > 1}
					<a href={data.page === 2 ? '/posts' : `/posts/page/${data.page - 1}`} rel="prev">← Newer</a>
				{/if}
			</div>
			<span>Page {data.page} of {data.totalPages}</span>
			<div>
				{#if data.page < data.totalPages}
					<a href={`/posts/page/${data.page + 1}`} rel="next">Older →</a>
				{/if}
			</div>
		</nav>
	{/if}
</PostsLayout>

<style>
	.posts-list {
		line-height: 1.6;
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 2rem;
		font-size: 0.875rem;
	}

	.pagination a {
		color: inherit;
		text-underline-offset: 0.2em;
	}
</style>
