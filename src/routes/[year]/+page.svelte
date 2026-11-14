<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostsLayout, DateArchiveHeader, FilterablePostFeed } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.year} - Casey Gollan</title>
	<meta name="description" content="Posts from {data.year} by Casey Gollan" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<FilterablePostFeed postsByDay={data.postsByDay}>
		{#snippet header(filter)}
			<DateArchiveHeader year={data.year} count={data.totalPosts} actions={filter} />
		{/snippet}
	</FilterablePostFeed>
</PostsLayout>
