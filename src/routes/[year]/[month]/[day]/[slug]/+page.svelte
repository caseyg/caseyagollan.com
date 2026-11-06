<script lang="ts">
	import type { PageData } from './$types';
	import BookmarkTitle from '$lib/components/posts/BookmarkTitle.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import Webmentions from '$lib/components/Webmentions.svelte';
	import { PostsLayout, DateArchiveHeader, PostMeta, PostContent, PostMedia } from '$lib/components/posts';

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

		{#if data.post.title || (data.post.type === 'bookmark' && data.post.bookmarkOf)}
			<h1 class="p-name post-title" class:bookmark-title={data.post.type === 'bookmark' && !!data.post.bookmarkOf}>
				{#if data.post.type === 'bookmark' && data.post.bookmarkOf}
					<BookmarkTitle url={data.post.bookmarkOf} title={data.post.title} />
				{:else}
					{data.post.title}
				{/if}
			</h1>
		{/if}

		{#if data.post.type === 'bookmark' && data.post.bookmarkOf}
			<p class="bookmark-url"><small><a class="u-bookmark-of" href={data.post.bookmarkOf}>{data.post.bookmarkOf.replace(/^https?:\/\//, '')}</a></small></p>
		{/if}

		<PostMedia photos={data.post.photo} videos={data.post.video} />
		{#if data.post.inReplyTo}
			<p>In reply to <a class="u-in-reply-to" href={data.post.inReplyTo}>{data.post.inReplyTo}</a></p>
		{/if}

		<PostContent content={data.post.content} format={data.post.contentFormat} />

		<Webmentions url={permalink} />
	</article>
</PostsLayout>

<style>
	.post {
		margin-bottom: 2rem;
	}

	.post-title.bookmark-title {
		margin-bottom: 0.1rem;
	}

	.bookmark-url a {
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		text-underline-offset: 0.15em;
	}

	.bookmark-url a:hover {
		text-decoration: underline;
	}

	.bookmark-url {
		margin: 0 0 1rem;
		overflow-wrap: anywhere;
	}

	.post-title {
		font-size: 1.75rem;
		line-height: 1.25;
		margin: 0.5rem 0 1rem;
		font-weight: 600;
	}
</style>
