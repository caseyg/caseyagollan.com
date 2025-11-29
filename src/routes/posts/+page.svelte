<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostCard, DateHeader, PostsLayout } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Posts - Casey Gollan</title>
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
</PostsLayout>

<style>
	.posts-list {
		line-height: 1.6;
	}
</style>
