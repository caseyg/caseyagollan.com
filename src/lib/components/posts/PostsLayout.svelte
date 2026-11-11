<script lang="ts">
	import type { Snippet } from 'svelte';
	import Page from '$lib/components/ui/Page.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<!-- The reading-width page used by every posts route. -->
<Page width="reading">
	{@render children()}
</Page>
