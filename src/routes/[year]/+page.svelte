<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostsLayout, DateArchiveHeader, PostFeed } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.year} - Casey Gollan</title>
	<meta name="description" content="Posts from {data.year} by Casey Gollan" />
</svelte:head>

<Nav currentPage="posts" showPostsLink={true} />

<PostsLayout>
	<DateArchiveHeader year={data.year} count={data.totalPosts} />

	<PostFeed postsByDay={data.postsByDay} />
</PostsLayout>
