<script lang="ts">
 import type { Post } from '$lib/posts-types';
 import SocialCard from './SocialCard.svelte';
 import SavedSocialPost from './SavedSocialPost.svelte';
 import SiteSocialPost from './SiteSocialPost.svelte';
 /** A note or reply. A reply shows the saved post it answers above it, joined by the thread line; the meta line above the card already names who it replies to. */
 let { post, fill = false, byline = true }: { post: Post; /** Fills the box it is given, as a block on a table (see SocialCard). */ fill?: boolean; /** Off, only the posts' content (see SocialPost). */ byline?: boolean } = $props();
 const reply = $derived(post.inReplyTo || (typeof post.properties?.['in-reply-to']?.[0] === 'string' ? post.properties['in-reply-to'][0] as string : ''));
 const parent = $derived(reply ? post.socialSnapshots?.find(s => s.url === reply || s.sourceUrl === reply) : undefined);
</script>

<SocialCard {fill}>
 {#if parent}<SavedSocialPost snapshot={parent} connected {byline} />{/if}
 <SiteSocialPost {post} {byline} />
</SocialCard>
