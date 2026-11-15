<script lang="ts">
	import { MasonryGrid } from '$lib/components/ui';
	import { getPostPermalink, type Post } from '$lib/posts-types';
	import PhotoTile from './PhotoTile.svelte';

	interface Props {
		/** Posts newest first; each shows its first photo. Posts without photos are left out. */
		posts: Pick<Post, 'slug' | 'date' | 'photo'>[];
		label?: string;
	}

	let { posts, label = 'Photos' }: Props = $props();

	const tiles = $derived(
		posts
			.filter((post) => post.photo?.length)
			.map((post) => ({
				key: getPostPermalink(post),
				photo: post.photo![0],
				count: post.photo!.length,
				href: getPostPermalink(post),
				dateKey: post.date.slice(0, 10)
			}))
	);
</script>

<!-- A full-width waterfall of photo posts, each tile linking to its post. -->
{#if tiles.length}
	<MasonryGrid items={tiles} key={(tile) => tile.key} {label}>
		{#snippet item(tile)}
			<PhotoTile photo={tile.photo} href={tile.href} dateKey={tile.dateKey} count={tile.count} />
		{/snippet}
	</MasonryGrid>
{:else}
	<p class="empty">No photos yet.</p>
{/if}

<style>
	.empty {
		color: var(--text-muted);
	}
</style>
