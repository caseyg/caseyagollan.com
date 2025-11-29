<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		url: string;
	}

	let { url }: Props = $props();

	let likes = $state(0);
	let reposts = $state(0);
	let replies = $state(0);
	let loaded = $state(false);

	async function fetchCounts() {
		if (!browser) return;

		const targetUrl = `https://caseyagollan.com${url}`;
		const apiUrl = `https://webmention.io/api/count.json?target=${encodeURIComponent(targetUrl)}`;

		try {
			const response = await fetch(apiUrl);
			if (!response.ok) return;

			const data = await response.json();
			likes = data.type?.like || 0;
			reposts = data.type?.repost || 0;
			replies = (data.type?.reply || 0) + (data.type?.mention || 0);
		} catch (e) {
			console.error('Failed to fetch webmention counts:', e);
		} finally {
			loaded = true;
		}
	}

	onMount(() => {
		fetchCounts();
	});
</script>

{#if loaded && (likes > 0 || reposts > 0 || replies > 0)}
	<a href="{url}#webmentions" class="webmention-counts" title="{likes} favorite{likes !== 1 ? 's' : ''}, {reposts} repost{reposts !== 1 ? 's' : ''}, {replies} repl{replies === 1 ? 'y' : 'ies'}">
		{#if likes > 0}<span class="wm-count">⭐{likes}</span>{/if}
		{#if reposts > 0}<span class="wm-count">🔁{reposts}</span>{/if}
		{#if replies > 0}<span class="wm-count">💬{replies}</span>{/if}
	</a>
{/if}

<style>
	.webmention-counts {
		display: inline-flex;
		gap: 0.5em;
		text-decoration: none;
		color: inherit;
		font-size: 0.9em;
	}

	.webmention-counts:hover {
		text-decoration: underline;
	}

	.wm-count {
		opacity: 0.8;
	}
</style>
