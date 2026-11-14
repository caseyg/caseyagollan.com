<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostsLayout, DateArchiveHeader, FilterablePostFeed } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();

	const monthName = new Date(`${data.year}-${data.month}-01`).toLocaleString('en-US', {
		month: 'long'
	});
</script>

<svelte:head>
	<title>{monthName} {data.year} - Casey Gollan</title>
	<meta name="description" content="Posts from {monthName} {data.year} by Casey Gollan" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<FilterablePostFeed postsByDay={data.postsByDay}>
		{#snippet header(filter)}
			<DateArchiveHeader year={data.year} month={data.month} count={data.totalPosts} actions={filter} />
		{/snippet}
	</FilterablePostFeed>
</PostsLayout>
