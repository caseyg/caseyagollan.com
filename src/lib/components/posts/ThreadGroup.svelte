<script lang="ts">
 import { Chip } from '$lib/components/ui';
 import SocialCard from './SocialCard.svelte';
 import PostCard from './PostCard.svelte';
 import type { Post } from '$lib/posts-types';
 let { post, showType = true, activeTag }: {post: Post; showType?: boolean; activeTag?: string} = $props();
 const members = $derived(post.indexThreadPosts ?? []);
 const hasReplies = $derived(members.some(member => member.type === 'reply'));
 const likesOnly = $derived(members.every(member => member.type === 'like' && (!member.indexActivities || member.indexActivities.every(activity => activity.type === 'like'))));
</script>

<section class="thread-group" class:likes-only={likesOnly} aria-label="Conversation activity">
 {#if likesOnly}
  <div class="thread-meta"><Chip href="/type/likes/"><span aria-hidden="true">♥</span> liked {members.length} posts in a thread</Chip></div>
  <SocialCard variant="thread">
   {#each members as member (member.filePath)}
    <PostCard post={member} {showType} {activeTag} groupedLike />
   {/each}
  </SocialCard>
 {:else}
  <p class="thread-label">{hasReplies ? 'Replies and reactions in this thread' : 'Reactions in this thread'}</p>
  {#each members as member (member.filePath)}
   <PostCard post={member} {showType} {activeTag} />
  {/each}
 {/if}
</section>

<style>
 .thread-group { border-left: 2px solid var(--border-subtle); padding-left: var(--space-3); margin-bottom: var(--space-5); }
 .likes-only { border-left: 0; padding-left: 0; }
 .thread-meta { margin-left: calc(-1 * var(--space-2)); margin-bottom: var(--space-2); color: var(--text-muted); }
 .thread-label { color: var(--text-muted); font-size: var(--fs-sm); margin: 0 0 var(--space-3); }
</style>
