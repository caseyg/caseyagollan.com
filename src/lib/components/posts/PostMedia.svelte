<script lang="ts">
	import type { MediaItem } from '$lib/posts-types';

	interface Props {
		photos?: MediaItem[];
		videos?: MediaItem[];
	}

	let { photos, videos }: Props = $props();
</script>

{#if photos && photos.length > 0}
	<div class="photo-content">
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
	<div class="video-content">
		{#each videos as vid (vid.url)}
			<figure>
				<!-- svelte-ignore a11y_media_has_caption -->
				<video controls class="u-video" preload="metadata">
					<source src={vid.url} type={vid.type ?? 'video/mp4'} />
				</video>
				{#if vid.alt}
					<figcaption>{vid.alt}</figcaption>
				{/if}
			</figure>
		{/each}
	</div>
{/if}

<style>
	.photo-content,
	.video-content {
		margin: 0.5rem 0;
	}

	figure {
		margin: 0 0 1rem;
	}

	figure:last-child {
		margin-bottom: 0;
	}

	.u-photo,
	.u-video {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: 4px;
	}

	figcaption {
		margin-top: 0.5rem;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.4;
	}
</style>
