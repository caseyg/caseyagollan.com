<script lang="ts">
	import { Chip } from '$lib/components/ui';

	interface Props {
		category: string | string[] | undefined;
		activeTag?: string;
	}

	let { category, activeTag }: Props = $props();

	const categories = $derived(!category ? [] : Array.isArray(category) ? category : [category]);
</script>

{#if categories.length > 0}
	<div class="post-categories">
		{#each categories as cat (cat)}
			<Chip href="/tag/{cat.toLowerCase()}/" variant="soft" size="sm" active={cat.toLowerCase() === activeTag?.toLowerCase()}>{cat}</Chip>
		{/each}
	</div>
{/if}

<style>
	.post-categories {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
</style>
