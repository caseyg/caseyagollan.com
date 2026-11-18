<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import Webmentions from '$lib/components/Webmentions.svelte';
	import HCard from '$lib/components/HCard.svelte';
	import { PostsLayout, DateArchiveHeader, PostMeta, PostTitle, PostContent, PostMedia, PostDetails, NoteCard } from '$lib/components/posts';

	import { getPostAction } from '$lib/utils/post-details';
	import { renderContentSync } from '$lib/utils/renderContent';

	let { data }: { data: PageData } = $props();

	const permalink = `/${data.year}/${data.month}/${data.day}/${data.post.slug}/`;
	// The description is the post's visible text, not its Markdown or HTML source.
	const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' };
	const plain = (html: string) => html.replace(/<[^>]*>/g, ' ')
		.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|nbsp);/gi, (match, hex: string, dec: string, name: string) => hex || dec ? String.fromCodePoint(parseInt(hex ?? dec, hex ? 16 : 10)) : entities[name.toLowerCase()] ?? match)
		.replace(/\s+/g, ' ').trim();
	const description = $derived(data.post.summary || plain(renderContentSync(data.post.content, data.post.contentFormat)).slice(0, 160));
</script>

<svelte:head>
	<meta name="publishing-revision" content={data.revision} />
	<title>{data.post.title || data.post.type} - Casey Gollan</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="https://caseyagollan.com{permalink}" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<DateArchiveHeader year={data.year} month={data.month} day={data.day} parent />

	<article class="{data.post.microformatType ?? 'h-entry'} post">
		<HCard variant="author" />

		<PostMeta
			type={data.post.type}
			date={data.post.date}
			{permalink}
			syndication={data.post.syndication}
			category={data.post.category}
			action={getPostAction(data.post)}
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

		<Webmentions url={permalink} previous={data.post.previousUrls} />
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
