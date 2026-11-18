<script lang="ts">
	import HCard from '$lib/components/HCard.svelte';
	import NoteCard from './NoteCard.svelte';
	import PostDetails from './PostDetails.svelte';
	import PostMeta from './PostMeta.svelte';
	import PostTitle from './PostTitle.svelte';
	import { Button } from '$lib/components/ui';
	import PostContent from './PostContent.svelte';
	import PostMedia from './PostMedia.svelte';
	import type { Post } from '$lib/posts-types';
	import { getPostPermalink, postAnchors } from '$lib/posts-types';
	import { getPostAction } from '$lib/utils/post-details';

	interface Props {
		post: Post;
		showType?: boolean;
		activeTag?: string;
	}

	let { post, showType = true, activeTag }: Props = $props();

	function getPreview(content: string, maxLength: number = 280): string {
		// Strip HTML tags
		let stripped = content.replace(/<[^>]*>/g, '');
		// Strip markdown heading markers
		stripped = stripped.replace(/^#{1,6}\s+/gm, '');
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

	const permalink = $derived(getPostPermalink(post));
	const isArticle = $derived(post.type === 'article');
	const anchors = $derived(postAnchors(post));
</script>

<article class="{post.microformatType ?? 'h-entry'} post">
	{#each anchors as id (id)}<span {id} class="anchor" aria-hidden="true"></span>{/each}
	<HCard variant="author" />

	<PostMeta
		type={post.type}
		date={post.date}
		{permalink}
		syndication={post.syndication}
		{showType}
		category={post.category}
		people={post.people}
		{activeTag}
		indexActivities={post.indexActivities}
		action={getPostAction(post)}
	/>

	<PostTitle {post} href={isArticle ? permalink : undefined} />

	<PostDetails {post} />
	{#if post.indexActivities}
		<details class="activity-sources">
			<summary>{post.indexActivities.length} activities</summary>
			<ul>
				{#each post.indexActivities as activity (activity.permalink)}
					<li><a href={activity.permalink}>{activity.type === 'like' ? 'Liked' : 'Reposted'}{activity.author ? ` ${activity.author}’s post` : ''}{activity.network ? ` on ${activity.network}` : ''}</a> · {activity.dateSource === 'original-post' ? 'post dated ' : ''}<time datetime={activity.date}>{activity.date.slice(0, 10)}</time></li>
				{/each}
			</ul>
		</details>
	{/if}
	{#if post.summary && !isArticle && post.type !== 'note' && post.type !== 'reply'}<p class="p-summary">{post.summary}</p>{/if}
	{#if isArticle}
		<p class="p-summary preview">
			{post.summary || getPreview(post.content)}
		</p>
		<Button href={permalink} size="sm" class="read-more">Read more <span aria-hidden="true">→</span></Button>
	{:else if post.type === 'note' || post.type === 'reply'}
		<NoteCard {post} />
	{:else}
		<PostMedia photos={post.photo} videos={post.video} />
		<PostContent content={post.content} format={post.contentFormat} />
	{/if}
</article>

<style>
	.post {
		position: relative;
	}

	/* Anchors sit above the card by the pinned navigation's height, so a jump to one stops just below the nav.
	   (scroll-margin would be cleaner, but SvelteKit's client router undoes it after navigating.) */
	.anchor {
		position: absolute;
		top: calc(-1 * (var(--nav-lane) + var(--space-3)));
	}

	.activity-sources {
		margin: var(--space-3) 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}

	.activity-sources summary {
		width: fit-content;
		cursor: pointer;
	}

	.activity-sources summary:hover {
		color: var(--text-primary);
	}

	.activity-sources ul {
		margin: var(--space-2) 0 0;
		padding-left: 1.2em;
	}

	.activity-sources a {
		color: inherit;
		text-underline-offset: var(--underline-offset);
	}

	.activity-sources time {
		font-variant-numeric: tabular-nums;
	}

	.p-summary {
		margin: 0 0 var(--space-3);
		text-wrap: pretty;
	}

	.preview {
		margin: 0 0 var(--space-2);
		color: var(--text-secondary);
		font-size: 0.9375rem;
		line-height: var(--lh-normal);
	}
</style>
