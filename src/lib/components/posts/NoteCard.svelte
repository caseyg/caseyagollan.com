<script lang="ts">
 import { renderPostQuotations, renderReplyContext, renderReplyLabel } from '$lib/utils/post-details';
 import type { Post } from '$lib/posts-types';
 import { getPostPermalink } from '$lib/posts-types';
 import { siteAuthor } from '$lib/social-card';
 import SocialCard from './SocialCard.svelte';
 import PostContent from './PostContent.svelte';
 import PostMedia from './PostMedia.svelte';
 let { post }: { post: Post } = $props();
 const replyContext=$derived(renderReplyContext(post, {omitLabel: true}));
 const replyLabel=$derived(renderReplyLabel(post));
 const quotes=$derived(renderPostQuotations(post));
</script>

{#if replyLabel}<div class="reply-label">{@html replyLabel}</div>{/if}

<SocialCard contextHtml={replyContext} author={siteAuthor} published={post.date} url={getPostPermalink(post)}>
 {#if post.summary}<p class="p-summary">{post.summary}</p>{/if}
 <PostMedia photos={post.photo} videos={post.video} />
 <PostContent content={post.content} format={post.contentFormat} />
 {#if quotes}<div class="social-quoted-post">{@html quotes}</div>{/if}
</SocialCard>

<style>
 .reply-label { color: var(--text-muted); font-size: 0.875rem; line-height: 1.4; overflow-wrap: anywhere; }
 .reply-label :global(p) { margin: 0.5rem 0; }
 .reply-label :global(a) { color: inherit; text-underline-offset: 0.15em; }
</style>
