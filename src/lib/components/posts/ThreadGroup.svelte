<script lang="ts">
 import { onMount } from 'svelte';
 import { Chip } from '$lib/components/ui';
 import SocialCard from './SocialCard.svelte';
 import SocialPost from './SocialPost.svelte';
 import SavedSocialPost from './SavedSocialPost.svelte';
 import SiteSocialPost from './SiteSocialPost.svelte';
 import { getPostPermalink, type Post } from '$lib/posts-types';
 import { buildThreadEntries, type ThreadReaction } from '$lib/utils/thread-entries';
 import { ownerHint } from '$lib/owner';
 /** A rolled-up conversation: every reply, like and repost in one card, as one thread joined by a line. */
 const REACTION = { like: ['♥', 'liked'], repost: ['🔁', 'reposted'] } as const;
 let { post }: {post: Post; showType?: boolean; activeTag?: string} = $props();
 const members = $derived(post.indexThreadPosts ?? []);
 const entries = $derived(buildThreadEntries(members));
 const replies = $derived(members.filter(member => member.type === 'reply').length);
 const reactions = $derived(entries.reduce((n, entry) => n + (entry.kind === 'own' ? 0 : entry.reactions.length), 0));
 const verbs = $derived([...new Set(entries.flatMap(entry => entry.kind === 'own' ? [] : entry.reactions.map(r => r.type)))]);
 const summary = $derived([
  replies ? `replied ${replies === 1 ? 'once' : `${replies} times`}` : '',
  reactions ? `${verbs.map(v => REACTION[v][1]).join(' and ')} ${reactions === 1 ? '1 post' : `${reactions} posts`}` : ''
 ].filter(Boolean).join(' and '));
 // Pages are static, so the owner's edit links appear only after hydration.
 let owner = $state(false);
 onMount(() => { owner = ownerHint(); });
 const marks = (list: ThreadReaction[]) => list.map(r => ({ icon: REACTION[r.type][0], label: REACTION[r.type][1], href: r.permalink }));
</script>

<section class="thread-group" aria-label="Conversation activity">
 <div class="thread-meta"><Chip href={getPostPermalink(post).replace(/[^/]+\/$/, '')}><span aria-hidden="true">{replies ? '💬' : REACTION[verbs[0] ?? 'like'][0]}</span> {summary} in a thread</Chip></div>
 <SocialCard label="Conversation">
  {#each entries as entry, i (entry.key)}
   {@const connected = i < entries.length - 1}
   {#if entry.kind === 'own'}
    {@const permalink = getPostPermalink(entry.post)}
    <SiteSocialPost post={entry.post} hEntry {connected} replyTo={entry.replyTo} editHref={owner ? `${permalink}edit/` : undefined} />
   {:else if entry.kind === 'saved'}
    <SavedSocialPost snapshot={entry.snapshot} {connected} marks={marks(entry.reactions)} />
   {:else}
    <SocialPost author={{ name: entry.label, url: entry.url }} url={entry.url} {connected} marks={marks(entry.reactions)}>
     <a href={entry.url}>{entry.url}</a>
    </SocialPost>
   {/if}
  {/each}
 </SocialCard>
</section>


<style>
 .thread-group { margin-bottom: var(--space-5); }
 .thread-meta { margin-left: calc(-1 * var(--space-2)); margin-bottom: var(--space-2); color: var(--text-muted); }
</style>
