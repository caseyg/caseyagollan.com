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
</style>
