<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostFeed, PhotoGrid, ArchiveHeader, PostsLayout } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();

	function capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
</script>

<svelte:head>
	<title>{capitalizeFirst(data.typePlural)} - Casey Gollan</title>
	<meta name="description" content="{capitalizeFirst(data.typePlural)} by Casey Gollan" />
	<meta property="og:title" content="{capitalizeFirst(data.typePlural)} - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout width={data.photos ? 'full' : 'reading'}>
	<ArchiveHeader title={capitalizeFirst(data.typePlural)} icon={data.typeIcon} count={data.totalPosts} />

	{#if data.photos}
		<PhotoGrid posts={data.photos} />
	{:else}
		<PostFeed postsByDay={data.postsByDay} showType={false} />
	{/if}
</PostsLayout>
