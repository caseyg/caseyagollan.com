<script lang="ts">
 import type { Post } from '$lib/posts-types';
 import { getPostPermalink } from '$lib/posts-types';
 import { siteAuthor } from '$lib/social-card';
 import SocialCard from './SocialCard.svelte';
 import PostContent from './PostContent.svelte';
 import PostMedia from './PostMedia.svelte';
 let { post }: { post: Post } = $props();
</script>

<SocialCard author={siteAuthor} published={post.date} url={getPostPermalink(post)}>
 {#if post.summary}<p class="p-summary">{post.summary}</p>{/if}
 <PostMedia photos={post.photo} videos={post.video} />
 <PostContent content={post.content} format={post.contentFormat} />
</SocialCard>
