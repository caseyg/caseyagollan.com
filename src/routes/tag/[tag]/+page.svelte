<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostFeed, DropdownArchiveHeader, PostsLayout } from '$lib/components/posts';

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

	<PostFeed postsByDay={data.postsByDay} activeTag={data.tag} />
</PostsLayout>
