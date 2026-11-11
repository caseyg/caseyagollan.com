<script lang="ts">
	import type { MediaItem } from '$lib/posts-types';

	interface Props {
		photos?: MediaItem[];
		videos?: MediaItem[];
	}

	let { photos, videos }: Props = $props();
</script>

{#if photos && photos.length > 0}
	<div class="media">
		{#each photos as img (img.url)}
			<figure>
				<img src={img.url} alt={img.alt ?? 'Photo'} class="u-photo" loading="lazy" />
				{#if img.alt}
					<figcaption>{img.alt}</figcaption>
				{/if}
			</figure>
		{/each}
	</div>
{/if}

{#if videos && videos.length > 0}
	<div class="media">
		{#each videos as vid (vid.url)}
			<figure>
				<!-- svelte-ignore a11y_media_has_caption -->
				<video controls class="u-video" preload="metadata">
					<source src={vid.url} type={vid.type} />
				</video>
				{#if vid.alt}
					<figcaption>{vid.alt}</figcaption>
				{/if}
			</figure>
		{/each}
	</div>
{/if}

<style>
	.media {
		margin: var(--space-2) 0;
	}

	figure {
		margin: 0 0 var(--space-4);
	}

	figure:last-child {
		margin-bottom: 0;
	}

	.u-photo,
	.u-video {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: var(--radius-sm);
	}

	figcaption {
		margin-top: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		text-wrap: pretty;
	}
</style>
