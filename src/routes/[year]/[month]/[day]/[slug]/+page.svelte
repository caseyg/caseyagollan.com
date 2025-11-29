<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';

	let { data }: { data: PageData } = $props();

	function formatPostDate(dateStr: string) {
		const date = new Date(dateStr);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	const permalink = `/${data.year}/${data.month}/${data.day}/${data.post.slug}/`;
</script>

<svelte:head>
	<title>{data.post.title || data.post.type} - Casey Gollan</title>
	<meta name="description" content={data.post.summary || data.post.content.slice(0, 160)} />
	<link rel="canonical" href="https://caseyagollan.com{permalink}" />
	<link rel="stylesheet" href="https://use.typekit.net/rfh8wvj.css" />
</svelte:head>

<Nav currentPage="posts" showPostsLink={true} />

<div class="container">
	<article class="h-entry post">
		<div class="post-meta">
			<span class="post-type">{data.post.type}</span>
			<a href={permalink} class="u-url permalink">
				<time class="dt-published" datetime={data.post.date}>{formatPostDate(data.post.date)}</time>
			</a>
		</div>

		{#if data.post.title}
			<h1 class="p-name post-title">{data.post.title}</h1>
		{/if}

		<div class="e-content post-content">
			{@html data.post.content}
		</div>

		{#if data.post.category}
			<div class="post-categories">
				{#if typeof data.post.category === 'string'}
					<span class="category-tag p-category">{data.post.category}</span>
				{:else if Array.isArray(data.post.category)}
					{#each data.post.category as cat (cat)}
						<span class="category-tag p-category">{cat}</span>
					{/each}
				{/if}
			</div>
		{/if}
	</article>
</div>

<style>
	:global(body) {
		background: gray;
		color: white;
		font-family: ff-dagny-web-pro, sans-serif;
		margin: 0;
		padding: 0;
	}

	.container {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	.post {
		margin-bottom: 2rem;
	}

	.post-meta {
		display: flex;
		gap: 1rem;
		font-size: 0.9rem;
		opacity: 0.8;
		margin-bottom: 0.5rem;
	}

	.post-type {
		text-transform: uppercase;
		font-weight: bold;
		color: rgb(73, 73, 255);
	}

	.permalink {
		color: inherit;
		text-decoration: none;
	}

	.permalink:hover {
		text-decoration: underline;
	}

	.post-title {
		font-size: 2rem;
		margin: 0.5rem 0 1rem;
		font-weight: bold;
	}

	.post-content {
		margin: 1rem 0;
		line-height: 1.6;
	}

	.post-content :global(p) {
		margin: 1rem 0;
	}

	.post-content :global(a) {
		color: rgb(150, 150, 255);
	}

	.post-content :global(blockquote) {
		border-left: 3px solid rgba(255, 255, 255, 0.3);
		margin-left: 0;
		padding-left: 1rem;
		font-style: italic;
	}

	.post-categories {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 2rem;
	}

	.category-tag {
		background: rgba(255, 255, 255, 0.1);
		padding: 0.25rem 0.75rem;
		border-radius: 3px;
		font-size: 0.85rem;
	}
</style>
