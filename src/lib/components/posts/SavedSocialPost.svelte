<script lang="ts">
 import SocialPost from './SocialPost.svelte';
 import type { SocialSnapshot } from '$lib/social-snapshots';
 import { renderSocialSnapshotBody, socialSnapshotSource } from '$lib/social-snapshots';
 import './social-card.css';
 /** Someone else's post, saved from Bluesky or Mastodon, drawn as a SocialPost. */
 let { snapshot, connected = false, source = true, marks }: { snapshot: SocialSnapshot; connected?: boolean; /** Show the 🦋/🐘 link out. */ source?: boolean; marks?: { icon: string; label: string; href?: string }[] } = $props();
</script>

<SocialPost author={snapshot.author} date={snapshot.published} url={snapshot.sourceUrl ?? snapshot.url} sources={source ? [socialSnapshotSource(snapshot)] : []} {connected} {marks}>
 <div class="social-card-scope">{@html renderSocialSnapshotBody(snapshot)}</div>
</SocialPost>
