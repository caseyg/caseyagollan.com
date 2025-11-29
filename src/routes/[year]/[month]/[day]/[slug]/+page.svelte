<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import Webmentions from '$lib/components/Webmentions.svelte';
	import { PostsLayout, DateArchiveHeader, PostMeta, PostContent } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();

	const permalink = `/${data.year}/${data.month}/${data.day}/${data.post.slug}/`;
</script>

<svelte:head>
	<title>{data.post.title || data.post.type} - Casey Gollan</title>
	<meta name="description" content={data.post.summary || data.post.content.slice(0, 160)} />
	<link rel="canonical" href="https://caseyagollan.com{permalink}" />
</svelte:head>

<Nav currentPage="posts" showPostsLink={true} />

<PostsLayout>
	<DateArchiveHeader year={data.year} month={data.month} day={data.day} />

	<article class="h-entry post">
		<!-- Hidden h-card for author info - required by Bridgy and other IndieWeb tools -->
		<a href="https://caseyagollan.com" class="p-author h-card" hidden>Casey Gollan</a>

		<PostMeta
			type={data.post.type}
			date={data.post.date}
			{permalink}
			syndication={data.post.syndication}
			category={data.post.category}
		/>

		{#if data.post.title}
			<h1 class="p-name post-title">{data.post.title}</h1>
		{/if}

		<PostContent content={data.post.content} />

		<Webmentions url={permalink} />
	</article>
</PostsLayout>

<style>
	.post {
		margin-bottom: 2rem;
	}

	.post-title {
		font-size: 1.75rem;
		line-height: 1.25;
		margin: 0.5rem 0 1rem;
		font-weight: 600;
	}
</style>
