<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import Webmentions from '$lib/components/Webmentions.svelte';
	import { PostsLayout, DateArchiveHeader, PostMeta, PostTitle, PostContent, PostMedia, PostDetails, NoteCard } from '$lib/components/posts';

	let { data }: { data: PageData } = $props();

	const permalink = `/${data.year}/${data.month}/${data.day}/${data.post.slug}/`;
</script>

<svelte:head>
	<meta name="publishing-revision" content={data.revision} />
	<title>{data.post.title || data.post.type} - Casey Gollan</title>
	<meta name="description" content={data.post.summary || data.post.content.slice(0, 160)} />
	<link rel="canonical" href="https://caseyagollan.com{permalink}" />
</svelte:head>

<Nav currentPage="posts" showPostsLink={true} />

<PostsLayout>
	<DateArchiveHeader year={data.year} month={data.month} day={data.day} />

	<article class="{data.post.microformatType ?? 'h-entry'} post">
		<!-- Hidden h-card for author info - required by Bridgy and other IndieWeb tools -->
		<a href="https://caseyagollan.com" class="p-author h-card" hidden>Casey Gollan</a>

		<PostMeta
			type={data.post.type}
			date={data.post.date}
			{permalink}
			syndication={data.post.syndication}
			category={data.post.category}
		/>

		<PostTitle post={data.post} context="page" />

		{#if data.post.type === 'note' || data.post.type === 'reply'}
			<PostDetails post={data.post} />
			<NoteCard post={data.post} />
		{:else}
			<PostMedia photos={data.post.photo} videos={data.post.video} />
			<PostDetails post={data.post} />
			{#if data.post.summary}<p class="p-summary">{data.post.summary}</p>{/if}

			<PostContent content={data.post.content} format={data.post.contentFormat} />
		{/if}

		<Webmentions url={permalink} />
	</article>
</PostsLayout>

<style>
	.post {
		margin-bottom: var(--space-6);
	}

	.p-summary {
		margin: 0 0 var(--space-4);
		color: var(--text-secondary);
		font-size: var(--fs-lg);
		line-height: var(--lh-normal);
		text-wrap: pretty;
	}
</style>
