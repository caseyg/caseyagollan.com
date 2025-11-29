<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostsLayout, DateArchiveHeader, DateHeader, PostCard } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.year} - Casey Gollan</title>
	<meta name="description" content="Posts from {data.year} by Casey Gollan" />
</svelte:head>

<Nav currentPage="posts" showPostsLink={true} />

<PostsLayout>
	<DateArchiveHeader year={data.year} count={data.totalPosts} />

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
	.posts-list {
		line-height: 1.6;
	}
</style>
