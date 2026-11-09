<script lang="ts">
 import { renderPostQuotations, renderReplyContext } from '$lib/utils/post-details';
 import type { Post } from '$lib/posts-types';
 import { getPostPermalink } from '$lib/posts-types';
 import { siteAuthor } from '$lib/social-card';
 import SocialCard from './SocialCard.svelte';
 import PostContent from './PostContent.svelte';
 import PostMedia from './PostMedia.svelte';
 let { post }: { post: Post } = $props();
 const replyContext=$derived(renderReplyContext(post));
 const quotes=$derived(renderPostQuotations(post));
</script>

<SocialCard contextHtml={replyContext} author={siteAuthor} published={post.date} url={getPostPermalink(post)}>
 {#if post.summary}<p class="p-summary">{post.summary}</p>{/if}
 <PostMedia photos={post.photo} videos={post.video} />
 <PostContent content={post.content} format={post.contentFormat} />
 {#if quotes}<div class="social-quoted-post">{@html quotes}</div>{/if}
</SocialCard>
