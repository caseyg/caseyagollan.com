<script lang="ts">
	import { Heading } from '$lib/components/ui';
	import BookmarkTitle from './BookmarkTitle.svelte';
	import type { Post } from '$lib/posts-types';

	interface Props {
		post: Pick<Post, 'title' | 'type' | 'bookmarkOf'>;
		/** `feed` is a post among others; `page` is the post on its own permalink. */
		context?: 'feed' | 'page';
		/** Links the title to the post, for articles shown as previews. */
		href?: string;
	}

	let { post, context = 'feed', href }: Props = $props();

	const bookmarkUrl = $derived(post.type === 'bookmark' ? post.bookmarkOf : undefined);
</script>

{#if post.title || bookmarkUrl}
	<div class="post-title post-title--{context}">
		<Heading level={context === 'page' ? 1 : 3} size={context === 'page' ? 'title' : 'subtitle'} class="p-name">
			{#if bookmarkUrl}
				<BookmarkTitle url={bookmarkUrl} title={post.title} />
			{:else if href}
				<a {href} class="title-link">{post.title}</a>
			{:else}
				{post.title}
			{/if}
		</Heading>
		{#if bookmarkUrl}
			<p class="source"><a class="u-bookmark-of" href={bookmarkUrl}>{bookmarkUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></p>
		{/if}
	</div>
{/if}

<style>
	.post-title--feed {
		margin: var(--space-1) 0 var(--space-2);
	}

	.post-title--page {
		margin: var(--space-2) 0 var(--space-4);
	}

	.title-link {
		color: inherit;
		text-decoration: none;
		text-decoration-thickness: from-font;
		text-underline-offset: var(--underline-offset);
	}

	.title-link:hover {
		text-decoration: underline;
	}

	.source {
		margin: var(--space-1) 0 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		overflow-wrap: anywhere;
	}

	.source a {
		color: inherit;
		text-decoration: none;
		text-underline-offset: var(--underline-offset);
	}

	.source a:hover {
		text-decoration: underline;
	}
</style>
