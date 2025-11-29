<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostCard, DateHeader, PostsLayout } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();

	const countText = $derived(data.totalPosts === 1 ? '1 post' : `${data.totalPosts} posts`);
</script>

<svelte:head>
	<title>Posts - Casey Gollan</title>
	<meta name="description" content="Posts, notes, and bookmarks by Casey Gollan" />
	<meta property="og:title" content="Posts - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<div class="header">
		<span class="pill">Posts</span>
		<p class="count-description">{countText}</p>
	</div>

	<div class="posts-list h-feed">
		{#each data.postsByDay as [dateKey, postsForDay] (dateKey)}
			<DateHeader {dateKey} />

			{#each postsForDay as post (post.slug)}
				<PostCard {post} />
			{/each}
		{/each}
	</div>
</PostsLayout>

<style>
	.header {
		margin-bottom: 3rem;
	}

	.pill {
		background: #0000ff;
		color: #fff;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		display: inline-block;
		font-size: 1.25rem;
		font-weight: 500;
	}

	.count-description {
		margin: 0.75rem 0 0;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.posts-list {
		line-height: 1.6;
	}
</style>
