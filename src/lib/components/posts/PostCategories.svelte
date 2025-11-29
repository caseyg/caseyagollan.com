<script lang="ts">
	interface Props {
		category: string | string[] | undefined;
		activeTag?: string;
	}

	let { category, activeTag }: Props = $props();

	function getCategories(cat: string | string[] | undefined): string[] {
		if (!cat) return [];
		return Array.isArray(cat) ? cat : [cat];
	}

	const categories = $derived(getCategories(category));
</script>

{#if categories.length > 0}
	<div class="post-categories">
		{#each categories as cat (cat)}
			<a href="/tag/{cat.toLowerCase()}/" class="category-tag" class:active={cat.toLowerCase() === activeTag?.toLowerCase()}>{cat}</a>
		{/each}
	</div>
{/if}

<style>
	.post-categories {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}

	.category-tag {
		background: rgba(255, 255, 255, 0.1);
		padding: 0.25rem 0.625rem;
		border-radius: 3px;
		font-size: 0.8125rem;
		color: #fff;
		text-decoration: none;
		transition: background 0.15s ease;
	}

	.category-tag:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.category-tag.active {
		background: #0000ff;
	}
</style>
