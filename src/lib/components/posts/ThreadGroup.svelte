<script lang="ts">
 import PostCard from './PostCard.svelte';
 import type { Post } from '$lib/posts-types';
 let { post, showType = true, activeTag }: {post: Post; showType?: boolean; activeTag?: string} = $props();
 const members = $derived(post.indexThreadPosts ?? []);
 const hasReplies = $derived(members.some(member => member.type === 'reply'));
 const likesOnly = $derived(members.every(member => member.type === 'like' && (!member.indexActivities || member.indexActivities.every(activity => activity.type === 'like'))));
</script>

<section class="thread-group" aria-label="Conversation activity">
 <p class="thread-label">{likesOnly ? `Liked ${members.length} posts in this thread` : hasReplies ? 'Replies and reactions in this thread' : 'Reactions in this thread'}</p>
 {#each members as member (member.filePath)}
  <PostCard post={member} {showType} {activeTag} />
 {/each}
</section>

<style>
 .thread-group { border-left: 2px solid var(--border-subtle); padding-left: var(--space-3); margin-bottom: var(--space-5); }
 .thread-label { color: var(--text-muted); font-size: var(--fs-sm); margin: 0 0 var(--space-3); }
</style>
