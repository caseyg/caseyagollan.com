<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostsLayout, DateArchiveHeader, DateHeader, PostCard } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();

	const monthName = new Date(`${data.year}-${data.month}-01`).toLocaleString('en-US', {
		month: 'long'
	});
</script>

<svelte:head>
	<title>{monthName} {data.year} - Casey Gollan</title>
	<meta name="description" content="Posts from {monthName} {data.year} by Casey Gollan" />
</svelte:head>

<Nav currentPage="posts" showPostsLink={true} />

<PostsLayout>
	<DateArchiveHeader year={data.year} month={data.month} count={data.totalPosts} />

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
