<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostsLayout, DateArchiveHeader, PostFeed } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();

	const fullDate = new Date(`${data.year}-${data.month}-${data.day}`).toLocaleString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});
</script>

<svelte:head>
	<title>{fullDate} - Casey Gollan</title>
	<meta name="description" content="Posts from {fullDate} by Casey Gollan" />
</svelte:head>

<Nav currentPage="posts" showPostsLink={true} />

<PostsLayout>
	<DateArchiveHeader year={data.year} month={data.month} day={data.day} count={data.totalPosts} />

	<PostFeed posts={data.posts} />
</PostsLayout>
