<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostFeed, PostsLayout } from '$lib/components/posts';
	import { Pagination } from '$lib/components/ui';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Posts{data.page > 1 ? ` - Page ${data.page}` : ''} - Casey Gollan</title>
	<meta name="description" content="Posts, notes, and bookmarks by Casey Gollan" />
	<meta property="og:title" content="Posts - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<PostFeed postsByDay={data.postsByDay} />
	<Pagination
		label="Posts pagination"
		page={data.page}
		totalPages={data.totalPages}
		prevHref={data.page > 1 ? (data.page === 2 ? '/posts' : `/posts/page/${data.page - 1}`) : undefined}
		nextHref={data.page < data.totalPages ? `/posts/page/${data.page + 1}` : undefined}
	/>
</PostsLayout>
