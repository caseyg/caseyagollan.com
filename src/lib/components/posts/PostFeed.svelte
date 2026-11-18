<script lang="ts">
	import DateHeader from './DateHeader.svelte';
	import PostCard from './PostCard.svelte';
	import ThreadGroup from './ThreadGroup.svelte';
	import HCard from '$lib/components/HCard.svelte';
	import { Divider } from '$lib/components/ui';
	import { SITE_IDENTITY } from '$lib/identity';
	import type { Post } from '$lib/posts-types';

	interface Props {
		/** Posts grouped under sticky date headers, as `[dateKey, posts]` pairs. */
		postsByDay?: [string, Post[]][];
		/** A flat list, for pages that already name the day. */
		posts?: Post[];
		showType?: boolean;
		activeTag?: string;
		/** The h-feed's name, for feed readers that follow the page. */
		name?: string;
	}

	let { postsByDay, posts, showType = true, activeTag, name = `${SITE_IDENTITY.name}’s posts` }: Props = $props();
</script>

<div class="post-feed h-feed">
	<data class="p-name" value={name}></data>
	<HCard variant="author" />
	{#if postsByDay}
		{#each postsByDay as [dateKey, postsForDay] (dateKey)}
			<DateHeader {dateKey} />
			{#each postsForDay as post, i (post.slug)}
				{#if i > 0}<Divider />{/if}
				{#if post.indexThreadPosts}<ThreadGroup {post} {showType} {activeTag} />{:else}<PostCard {post} {showType} {activeTag} />{/if}
			{/each}
		{/each}
	{/if}
	{#if posts}
		{#each posts as post, i (post.slug)}
			{#if i > 0}<Divider />{/if}
			{#if post.indexThreadPosts}<ThreadGroup {post} {showType} {activeTag} />{:else}<PostCard {post} {showType} {activeTag} />{/if}
		{/each}
	{/if}
</div>
