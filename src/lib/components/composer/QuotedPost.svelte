<script lang="ts">
	import SocialCard from '../posts/SocialCard.svelte';
	import SavedSocialPost from '../posts/SavedSocialPost.svelte';
	import type { SocialSnapshot } from '$lib/social-snapshots';

	interface Props {
		/** The quoted post's address. */
		url: string;
		/** The networks that attach it as a native quote, by name. */
		networks: string[];
		/** The quoted post as saved on the site, when it was. */
		snapshot?: SocialSnapshot;
	}

	/** The post a syndicated copy quotes, shown under the first post the way the network will attach it. */
	let { url, networks, snapshot }: Props = $props();
	const short = $derived.by(() => { try { const link = new URL(url); return link.host + link.pathname.replace(/\/$/, ''); } catch { return url; } });
</script>

<div class="quoted">
	<p class="caption">Quoted on {networks.join(' and ')}</p>
	{#if snapshot}
		<SocialCard label="Quoted post"><SavedSocialPost {snapshot} /></SocialCard>
	{:else}
		<a class="link" href={url} target="_blank" rel="noopener noreferrer">{short}</a>
	{/if}
</div>

<style>
	.quoted { display: flex; flex-direction: column; gap: var(--space-1); }
	.quoted :global(.social-card) { margin: 0; }
	.caption { margin: 0; color: var(--text-muted); font-size: var(--fs-xs); }
	.link { padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); color: var(--text-primary); font-size: var(--fs-sm); overflow-wrap: anywhere; }
</style>
