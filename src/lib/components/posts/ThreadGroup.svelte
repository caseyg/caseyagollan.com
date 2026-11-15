<script lang="ts">
 import { onMount } from 'svelte';
 import { Chip } from '$lib/components/ui';
 import SocialCard from './SocialCard.svelte';
 import PostCard from './PostCard.svelte';
 import ThreadEntry from './ThreadEntry.svelte';
 import PostContent from './PostContent.svelte';
 import PostMedia from './PostMedia.svelte';
 import { getPostPermalink, type Post } from '$lib/posts-types';
 import { siteAuthor, socialSource } from '$lib/social-card';
 import { renderSocialSnapshotBody, socialSnapshotSource } from '$lib/social-snapshots';
 import { renderLinkPreviews, renderPostQuotations } from '$lib/utils/post-details';
 import { buildThreadEntries } from '$lib/utils/thread-entries';
 import { ownerHint } from '$lib/owner';
 import './social-card.css';
 let { post, showType = true, activeTag }: {post: Post; showType?: boolean; activeTag?: string} = $props();
 const members = $derived(post.indexThreadPosts ?? []);
 const hasReplies = $derived(members.some(member => member.type === 'reply'));
 const likesOnly = $derived(members.every(member => member.type === 'like' && (!member.indexActivities || member.indexActivities.every(activity => activity.type === 'like'))));
 const entries = $derived(likesOnly ? [] : buildThreadEntries(members));
 const self = { ...siteAuthor, handle: '@caseyagollan.com' };
 // Pages are static, so the owner's edit links appear only after hydration.
 let owner = $state(false);
 onMount(() => { owner = ownerHint(); });
 const REACTION = { like: ['♥', 'liked'], repost: ['🔁', 'reposted'] } as const;
</script>

<section class="thread-group" class:likes-only={likesOnly} aria-label="Conversation activity">
 {#if likesOnly}
  <div class="thread-meta"><Chip href={getPostPermalink(post).replace(/[^/]+\/$/, '')}><span aria-hidden="true">♥</span> liked {members.length} posts in a thread</Chip></div>
  <SocialCard variant="thread">
   {#each members as member (member.filePath)}
    <PostCard post={member} {showType} {activeTag} groupedLike />
   {/each}
  </SocialCard>
 {:else}
  <p class="thread-label">{hasReplies ? 'Replies and reactions in this thread' : 'Reactions in this thread'}</p>
  <div class="thread social-card-scope">
   {#each entries as entry, i (entry.key)}
    {@const connected = i < entries.length - 1}
    {#if entry.kind === 'own'}
     {@const reply = entry.post}
     {@const permalink = getPostPermalink(reply)}
     <ThreadEntry own author={self} date={reply.date} url={permalink} {connected}
      sources={(reply.syndication ?? []).map(link => socialSource(link, 'u-syndication'))}
      editHref={owner ? `${permalink}edit/` : undefined}>
      {#snippet context()}
       {#if entry.replyTo}Replying to <a class="u-in-reply-to" href={entry.replyTo.url}>{entry.replyTo.label}</a>
       {:else if reply.inReplyTo}<a class="u-in-reply-to" href={reply.inReplyTo} hidden>In reply to</a>{/if}
      {/snippet}
      {#if reply.summary}<p class="p-summary">{reply.summary}</p>{/if}
      <PostMedia photos={reply.photo} videos={reply.video} />
      <PostContent content={reply.content} format={reply.contentFormat} />
      {@html renderLinkPreviews(reply)}
      {#if renderPostQuotations(reply)}<div class="social-quoted-post">{@html renderPostQuotations(reply)}</div>{/if}
     </ThreadEntry>
    {:else if entry.kind === 'saved'}
     <ThreadEntry author={entry.snapshot.author} date={entry.snapshot.published} url={entry.snapshot.sourceUrl ?? entry.snapshot.url} sources={[socialSnapshotSource(entry.snapshot)]} {connected}>
      {#snippet badges()}{@render reactions(entry.reactions)}{/snippet}
      {@html renderSocialSnapshotBody(entry.snapshot)}
     </ThreadEntry>
    {:else}
     <ThreadEntry author={{ name: entry.label, url: entry.url }} url={entry.url} {connected}>
      {#snippet badges()}{@render reactions(entry.reactions)}{/snippet}
      <a href={entry.url}>{entry.url}</a>
     </ThreadEntry>
    {/if}
   {/each}
  </div>
 {/if}
</section>

{#snippet reactions(list: { type: 'like' | 'repost'; permalink: string; date: string }[])}
 {#each list as reaction (reaction.type)}
  <a class="reaction" href={reaction.permalink}><span aria-hidden="true">{REACTION[reaction.type][0]}</span> {REACTION[reaction.type][1]}</a>
 {/each}
{/snippet}

<style>
 .thread-group { margin-bottom: var(--space-5); }
 .thread-meta { margin-left: calc(-1 * var(--space-2)); margin-bottom: var(--space-2); color: var(--text-muted); }
 .thread-label { color: var(--text-muted); font-size: var(--fs-sm); margin: 0 0 var(--space-3); }
 .thread :global(.thread-entry:last-child .main) { padding-bottom: 0; }
 .thread :global(.social-images), .thread :global(.social-link-preview), .thread :global(.social-quoted-post) { margin-top: var(--space-2); }
 .reaction { margin-left: var(--space-1); color: var(--text-muted); font-size: var(--fs-xs); text-decoration: none; }
 .reaction:hover { text-decoration: underline; text-underline-offset: var(--underline-offset); }
</style>
