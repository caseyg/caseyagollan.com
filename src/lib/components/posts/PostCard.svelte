<script lang="ts">
	import PostMeta from './PostMeta.svelte';
	import PostContent from './PostContent.svelte';
	import type { Post } from '$lib/posts-types';

	interface Props {
		post: Post;
		showType?: boolean;
		activeTag?: string;
	}

	let { post, showType = true, activeTag }: Props = $props();

	function getPermalink(p: { date: string; slug: string }) {
		const date = new Date(p.date);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `/${year}/${month}/${day}/${p.slug}/`;
	}

	function getPreview(content: string, maxLength: number = 280): string {
		// Strip HTML tags
		let stripped = content.replace(/<[^>]*>/g, '');
		// Strip markdown links [text](url) -> text
		stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
		// Strip markdown emphasis *text* or _text_ or **text** or __text__
		stripped = stripped.replace(/(\*\*|__)(.*?)\1/g, '$2');
		stripped = stripped.replace(/(\*|_)(.*?)\1/g, '$2');
		// Strip markdown code `code`
		stripped = stripped.replace(/`([^`]+)`/g, '$1');
		// Normalize whitespace
		stripped = stripped.replace(/\s+/g, ' ').trim();
		if (stripped.length <= maxLength) return stripped;
		return stripped.slice(0, maxLength).trim() + '...';
	}

	const permalink = $derived(getPermalink(post));
	const isArticle = $derived(post.type === 'article');
</script>

<article class="h-entry post">
	<!-- Hidden h-card for author info - required by Bridgy and other IndieWeb tools -->
	<a href="https://caseyagollan.com" class="p-author h-card" hidden>Casey Gollan</a>

	<PostMeta
		type={post.type}
		date={post.date}
		{permalink}
		syndication={post.syndication}
		{showType}
		category={post.category}
		{activeTag}
	/>

	{#if post.title}
		<h3 class="p-name post-title">
			{#if isArticle}
				<a href={permalink} class="title-link">{post.title}</a>
			{:else}
				{post.title}
			{/if}
		</h3>
	{/if}

	{#if isArticle}
		<p class="p-summary preview">
			{post.summary || getPreview(post.content)}
		</p>
		<a href={permalink} class="read-more">Read more</a>
	{:else}
		<PostContent content={post.content} />
	{/if}
</article>

<style>
	.post {
		margin-bottom: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.post:last-child {
		border-bottom: none;
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.post-title {
		font-size: 1.25rem;
		line-height: 1.3;
		margin: 0.25rem 0 0.5rem;
		font-weight: 600;
	}

	.title-link {
		color: inherit;
		text-decoration: none;
	}

	.title-link:hover {
		text-decoration: underline;
	}

	.preview {
		margin: 0;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.9375rem;
	}

	.read-more {
		display: inline-block;
		margin-top: 0.5rem;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.read-more:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}
</style>
