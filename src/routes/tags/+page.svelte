<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostsLayout, TagList } from '$lib/components/posts';
	import { PageHeader } from '$lib/components/ui';
	import { postsCrumb, TAGS_CRUMB } from '$lib/components/posts/trail';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Tags - Casey Gollan</title>
	<meta name="description" content="Every tag on posts by Casey Gollan" />
	<meta property="og:title" content="Tags - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<PageHeader trail={[postsCrumb('tags'), { ...TAGS_CRUMB, current: true }]} title="Tags" />
	<TagList tags={data.tags} />
</PostsLayout>
