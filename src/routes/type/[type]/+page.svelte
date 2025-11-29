<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostCard, DateHeader, DropdownArchiveHeader, PostsLayout } from '$lib/components/posts';

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

<PostsLayout>
	<DropdownArchiveHeader
		current={capitalizeFirst(data.typePlural)}
		currentIcon={data.typeIcon}
		options={data.allTypes}
		count={data.totalPosts}
	/>

	<div class="posts-list h-feed">
		{#each data.postsByDay as [dateKey, postsForDay] (dateKey)}
			<DateHeader {dateKey} />

			{#each postsForDay as post (post.slug)}
				<PostCard {post} showType={false} />
			{/each}
		{/each}
	</div>
</PostsLayout>

<style>
	.posts-list {
		line-height: 1.6;
	}
</style>
