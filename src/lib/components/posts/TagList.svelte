<script lang="ts">
	import { Chip, Count } from '$lib/components/ui';

	interface Props {
		/** Tags in the order to show them, each with the number of posts that carry it. */
		tags: { name: string; href: string; count: number }[];
	}

	let { tags }: Props = $props();
</script>

<ul class="tag-list" aria-label="Tags">
	{#each tags as tag (tag.href)}
		<li>
			<Chip href={tag.href} variant="soft" size="sm">#{tag.name} <Count value={tag.count} label="{tag.count} posts" /></Chip>
		</li>
	{/each}
</ul>

<style>
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
