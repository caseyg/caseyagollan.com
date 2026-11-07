<script lang="ts">
 import type { Post } from '$lib/posts-types';
 import { renderPostDetails } from '$lib/utils/post-details';
 let { post }: { post: Post } = $props();
</script>

<div class="post-details">{@html renderPostDetails(post)}</div>

<style>
 .post-details { line-height: 1.6; overflow-wrap: anywhere; }
 .post-details:empty { display: none; }
 .post-details :global(p) { margin: 0.5rem 0; }
 .post-details :global(a) { color: inherit; text-underline-offset: 0.15em; }
 .post-details :global(section) { margin: 0.75rem 0; padding-left: 1rem; border-left: 2px solid rgba(255,255,255,0.25); }
 .post-details :global(iframe) { max-width: 100%; border: 0; }
 .post-details :global(.social-snapshot) { margin: 0.75rem 0; padding: 1rem; border: 1px solid rgba(255,255,255,0.22); border-radius: 0.85rem; font-size: 1rem; }
 .post-details :global(.social-snapshot header) { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
 .post-details :global(.social-author) { display: flex; align-items: center; gap: 0.75rem; min-width: 0; text-decoration: none; }
 .post-details :global(.social-avatar) { width: 2.75rem; height: 2.75rem; flex: 0 0 auto; border-radius: 50%; object-fit: cover; }
 .post-details :global(.social-author-details) { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
 .post-details :global(.social-author-name) { font-size: 1.05rem; font-weight: 650; }
 .post-details :global(.social-author-handle) { opacity: 0.65; font-size: 0.95rem; overflow-wrap: anywhere; }
 .post-details :global(.social-platform) { flex-shrink: 0; opacity: 0.65; font-size: 0.75rem; text-decoration: none; }
 .post-details :global(.social-post-content) { line-height: 1.5; }
 .post-details :global(.social-post-content p) { margin: 0 0 0.85rem; }
 .post-details :global(.social-snapshot a) { color: inherit; text-decoration: underline; text-underline-offset: 0.15em; }
 .post-details :global(.social-snapshot a:hover) { text-decoration: underline; }
 .post-details :global(.social-attachment) { display: block; width: 100%; height: auto; margin-top: 0.75rem; border: 1px solid rgba(255,255,255,0.18); border-radius: 0.7rem; }
 .post-details :global(.social-snapshot footer) { margin-top: 0.85rem; opacity: 0.65; font-size: 0.8rem; }
 .post-details :global(.social-snapshot summary) { cursor: pointer; margin-bottom: 0.75rem; }
 @media (max-width: 480px) {
  .post-details :global(.social-snapshot) { padding: 0.85rem; }
  .post-details :global(.social-platform) { font-size: 0.65rem; }
 }
</style>
