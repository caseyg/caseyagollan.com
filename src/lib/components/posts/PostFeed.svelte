<script lang="ts">
	import DateHeader from './DateHeader.svelte';
	import PostCard from './PostCard.svelte';
	import type { Post } from '$lib/posts-types';

	interface Props {
		/** Posts grouped under sticky date headers, as `[dateKey, posts]` pairs. */
		postsByDay?: [string, Post[]][];
		/** A flat list, for pages that already name the day. */
		posts?: Post[];
		showType?: boolean;
		activeTag?: string;
	}

	let { postsByDay, posts, showType = true, activeTag }: Props = $props();
</script>

<div class="post-feed h-feed">
	{#if postsByDay}
		{#each postsByDay as [dateKey, postsForDay] (dateKey)}
			<DateHeader {dateKey} />
			{#each postsForDay as post (post.slug)}
				<PostCard {post} {showType} {activeTag} />
			{/each}
		{/each}
	{/if}
	{#if posts}
		{#each posts as post (post.slug)}
			<PostCard {post} {showType} {activeTag} />
		{/each}
	{/if}
</div>
