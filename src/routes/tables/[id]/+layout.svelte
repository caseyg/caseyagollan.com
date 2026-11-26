<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';

	let { children }: { children: Snippet } = $props();
</script>

<!--
	Each table gets its own page. Going from one table to another (Casey's Tables menu, or the
	chat opening a table it just made) would otherwise keep the same page: the old table's
	name and canvas stayed, and its next save wrote them into the new table.
-->
{#key page.params.id}
	{@render children()}
{/key}
