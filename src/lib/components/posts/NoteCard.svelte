<script lang="ts">
 import type { Post } from '$lib/posts-types';
 import SocialCard from './SocialCard.svelte';
 import SavedSocialPost from './SavedSocialPost.svelte';
 import SiteSocialPost from './SiteSocialPost.svelte';
 /** A note or reply. A reply shows the saved post it answers above it, joined by the thread line; the meta line above the card already names who it replies to. */
 let { post }: { post: Post } = $props();
 const reply = $derived(post.inReplyTo || (typeof post.properties?.['in-reply-to']?.[0] === 'string' ? post.properties['in-reply-to'][0] as string : ''));
 const parent = $derived(reply ? post.socialSnapshots?.find(s => s.url === reply || s.sourceUrl === reply) : undefined);
</script>

<SocialCard>
 {#if parent}<SavedSocialPost snapshot={parent} connected />{/if}
 <SiteSocialPost {post} />
</SocialCard>
