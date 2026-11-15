<script lang="ts">
	import type { Snippet } from 'svelte';
	import Page from '$lib/components/ui/Page.svelte';

	interface Props {
		children: Snippet;
		/** `full` spans the window, for a gallery such as the photos archive. */
		width?: 'reading' | 'full';
	}

	let { children, width = 'reading' }: Props = $props();
</script>

<!-- The page used by every posts route: reading width, or the full window for galleries. -->
<Page {width}>
	{@render children()}
</Page>
