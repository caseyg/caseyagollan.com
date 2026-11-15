<script lang="ts">
 import SocialCard from './SocialCard.svelte';
 import SavedSocialPost from './SavedSocialPost.svelte';
 import type { Post } from '$lib/posts-types';
 import { postDetailSnapshots, renderPostDetails } from '$lib/utils/post-details';
 // The meta line already says what was liked, reposted or replied to, so only the saved post is shown here.
 // Notes and replies draw their context inside their own card, so they get only the remaining details.
 let { post }: { post: Post } = $props();
 const own = $derived(post.type === 'note' || post.type === 'reply');
 const snapshots = $derived(own ? [] : postDetailSnapshots(post));
 const details = $derived(renderPostDetails(post,{omitQuotations:own,omitReply:own,omitLinkPreviews:own,omitReactionLabel:true,omitSnapshots:true}));
</script>

{#each snapshots as snapshot (snapshot.url)}
 <SocialCard><SavedSocialPost {snapshot} /></SocialCard>
{/each}
{#if details}
 <div class="post-details social-card-scope">{@html details}</div>
{/if}

<style>
 .post-details { line-height: 1.6; overflow-wrap: anywhere; }
 .post-details :global(p) { margin: var(--space-2) 0; }
 .post-details :global(a) { color: inherit; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); }
 .post-details :global(section) { margin: var(--space-3) 0; padding-left: var(--space-4); border-left: 2px solid var(--border-strong); }
 .post-details :global(iframe) { max-width: 100%; border: 0; }
</style>
