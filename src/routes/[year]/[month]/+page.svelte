<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';

	let { data }: { data: PageData } = $props();

	function formatDate(dateStr: string) {
		const [year, month, day] = dateStr.split('-');
		return { year, month, day };
	}

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

	function truncate(text: string, length: number = 280) {
		if (text.length <= length) return text;
		return text.slice(0, length).trim() + '...';
	}

	function getPermalink(post: { date: string; slug: string }) {
		const date = new Date(post.date);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `/${year}/${month}/${day}/${post.slug}/`;
	}

	const monthName = new Date(`${data.year}-${data.month}-01`).toLocaleString('en-US', {
		month: 'long'
	});
</script>

<svelte:head>
	<title>📡 {monthName} {data.year} - Casey Gollan</title>
	<meta name="description" content="Posts from {monthName} {data.year} by Casey Gollan" />
	<link rel="stylesheet" href="https://use.typekit.net/rfh8wvj.css" />
</svelte:head>

<Nav currentPage="posts" showPostsLink={true} />

<div class="container">

	<div class="header">
		<span class="pill">📡 {monthName} {data.year} ({data.totalPosts})</span>
	</div>

	<div class="posts-list h-feed">
		{#each data.postsByDay as [dateKey, postsForDay] (dateKey)}
			{@const dateInfo = formatDate(dateKey)}
			<h2 class="date-header">
				<div class="meta-pill">
					<a href="/{dateInfo.year}/" class="meta-segment">{dateInfo.year}</a>
					<a href="/{dateInfo.year}/{dateInfo.month}/" class="meta-segment">{dateInfo.month}</a>
					<a href="/{dateInfo.year}/{dateInfo.month}/{dateInfo.day}/" class="meta-segment"
						>{dateInfo.day}</a
					>
				</div>
			</h2>

			{#each postsForDay as post (post.slug)}
				<article class="h-entry post">
					<div class="post-meta">
						<span class="post-type">{post.type}</span>
						<a href={getPermalink(post)} class="u-url permalink">
							<time class="dt-published" datetime={post.date}>{formatPostDate(post.date)}</time>
						</a>
					</div>

					{#if post.title}
						<h3 class="p-name post-title">{post.title}</h3>
					{/if}

					<div class="e-content post-content">
						{#if post.summary}
							<p>{post.summary}</p>
						{:else}
							<p>{truncate(post.content)}</p>
						{/if}
					</div>

					{#if post.category}
						<div class="post-categories">
							{#if typeof post.category === 'string'}
								<span class="category-tag">{post.category}</span>
							{:else if Array.isArray(post.category)}
								{#each post.category as cat (cat)}
									<span class="category-tag">{cat}</span>
								{/each}
							{/if}
						</div>
					{/if}
				</article>
			{/each}
		{/each}
	</div>
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


	.meta-pill {
		display: inline-flex;
		background: blue;
		border-radius: 5px;
		overflow: hidden;
	}

	.meta-segment {
		padding: 0.5rem 1rem;
		color: white;
		text-decoration: none;
		border-right: 1px solid rgba(255, 255, 255, 0.3);
	}

	.meta-segment:last-child {
		border-right: none;
	}

	.meta-segment:hover {
		background: rgb(73, 73, 255);
	}

	.header {
		margin-bottom: 2rem;
	}

	.pill {
		background: blue;
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 5px;
		display: inline-block;
		font-size: 1.5rem;
	}

	.posts-list {
		line-height: 1.6;
	}

	.date-header {
		margin: 2rem 0 1rem;
		font-size: 1rem;
		font-weight: normal;
		position: sticky;
		top: 0;
		background: gray;
		padding: 0.5rem 0;
		z-index: 10;
	}

	.post {
		margin-bottom: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
	}

	.post:last-child {
		border-bottom: none;
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
		font-size: 1.3rem;
		margin: 0.5rem 0;
		font-weight: bold;
	}

	.post-content {
		margin: 1rem 0;
	}

	.post-content p {
		margin: 0.5rem 0;
	}

	.post-categories {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}

	.category-tag {
		background: rgba(255, 255, 255, 0.1);
		padding: 0.25rem 0.75rem;
		border-radius: 3px;
		font-size: 0.85rem;
	}
</style>
