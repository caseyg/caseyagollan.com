<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostCard, DateHeader, DropdownArchiveHeader, PostsLayout } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>#{data.tag} - Casey Gollan</title>
	<meta name="description" content="Posts tagged #{data.tag} by Casey Gollan" />
	<meta property="og:title" content="#{data.tag} - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<DropdownArchiveHeader
		current="#{data.tag}"
		options={data.allTags}
		count={data.totalPosts}
	/>

	<div class="posts-list h-feed">
		{#each data.postsByDay as [dateKey, postsForDay] (dateKey)}
			<DateHeader {dateKey} />

			{#each postsForDay as post (post.slug)}
				<PostCard {post} activeTag={data.tag} />
			{/each}
		{/each}
	</div>
</PostsLayout>

<style>
	.posts-list {
		line-height: 1.6;
	}
</style>
