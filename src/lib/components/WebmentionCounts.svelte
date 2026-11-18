<script lang="ts">
	import { onMount } from 'svelte';
	import { liveCounts, mentionCounts } from '$lib/webmentions-client';
	import { targetPath, type MentionCounts } from '$lib/webmentions';
	import Chip from '$lib/components/ui/Chip.svelte';

	interface Props {
		url: string;
		/** Counts already known, such as in Storybook; otherwise they're loaded. */
		counts?: MentionCounts;
	}

	let { url, counts: given }: Props = $props();

	let likes = $state(given?.like ?? 0);
	let reposts = $state(given?.repost ?? 0);
	let replies = $state(given?.reply ?? 0);
	let loaded = $state(!!given);

	// Feeds share one request for every post's counts, read from the site's own copy.
	onMount(() => {
		if (given) return;
		const path = targetPath(url) ?? url;
		void mentionCounts()
			.then((all) => (all ? (all[path] ?? null) : liveCounts(path)))
			.then((counts) => {
				likes = counts?.like ?? 0;
				reposts = counts?.repost ?? 0;
				replies = counts?.reply ?? 0;
			})
			.finally(() => (loaded = true));
	});
</script>

{#if loaded && (likes > 0 || reposts > 0 || replies > 0)}
	<Chip href="{url}#webmentions" class="webmention-counts" title="{likes} favorite{likes !== 1 ? 's' : ''}, {reposts} repost{reposts !== 1 ? 's' : ''}, {replies} repl{replies === 1 ? 'y' : 'ies'}">
		{#if likes > 0}<span class="wm-count"><span aria-hidden="true">⭐</span>{likes}</span>{/if}
		{#if reposts > 0}<span class="wm-count"><span aria-hidden="true">🔁</span>{reposts}</span>{/if}
		{#if replies > 0}<span class="wm-count"><span aria-hidden="true">💬</span>{replies}</span>{/if}
	</Chip>
{/if}

<style>
	.wm-count {
		display: inline-flex;
		gap: 0.2em;
		font-variant-numeric: tabular-nums;
	}

	.wm-count + .wm-count {
		margin-left: 0.25em;
	}
</style>
