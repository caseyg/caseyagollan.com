<script lang="ts">
 import SocialCard from './SocialCard.svelte';
 import type { Post } from '$lib/posts-types';
 import { renderPostDetails } from '$lib/utils/post-details';
 // The meta line already says what was liked, reposted or replied to, so only the saved post is shown here.
 let { post }: { post: Post } = $props();
 const details = $derived(renderPostDetails(post,{omitQuotations:post.type==='note'||post.type==='reply',omitReply:post.type==='note'||post.type==='reply',omitReactionLabel:true}));
</script>

{#if details}
 <div class="post-details"><SocialCard html={details} /></div>
{/if}

<style>
 .post-details { line-height: 1.6; overflow-wrap: anywhere; }
 .post-details :global(p) { margin: var(--space-2) 0; }
 .post-details :global(a) { color: inherit; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); }
 .post-details :global(section) { margin: var(--space-3) 0; padding-left: var(--space-4); border-left: 2px solid var(--border-strong); }
 .post-details :global(iframe) { max-width: 100%; border: 0; }
</style>
