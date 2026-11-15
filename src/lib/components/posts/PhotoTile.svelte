<script lang="ts">
	import type { MediaItem } from '$lib/posts-types';

	interface Props {
		photo: MediaItem;
		/** The post the photo belongs to. */
		href: string;
		/** The post's date as `YYYY-MM-DD`, shown on hover and focus. */
		dateKey: string;
		/** How many photos the post has; more than one shows a count. */
		count?: number;
	}

	let { photo, href, dateKey, count = 1 }: Props = $props();
</script>

<!-- One photo in a gallery, linking to its post. The date shows on hover and focus. -->
<a class="photo-tile" {href}>
	<img src={photo.url} alt={photo.alt || `Photo from ${dateKey}`} loading="lazy" decoding="async" />
	{#if count > 1}
		<span class="count" aria-label="{count} photos">{count}</span>
	{/if}
	<span class="date">{dateKey}</span>
</a>

<style>
	.photo-tile {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: var(--radius-sm);
		background: var(--surface-1);
		color: var(--text-primary);
		text-decoration: none;
		transition: transform var(--duration) var(--ease-out);
	}

	.photo-tile:active {
		transform: scale(0.98);
	}

	.photo-tile:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	img {
		display: block;
		width: 100%;
		height: auto;
		/* Keeps a tile visible while its image loads. */
		min-height: 4rem;
	}

	/* Gray labels, like the feed's other in-feed controls. */
	.count,
	.date {
		position: absolute;
		padding: 0 var(--space-2);
		border-radius: var(--radius-full);
		background: rgb(128 128 128 / 0.85);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: 1.6;
		font-variant-numeric: tabular-nums;
	}

	.count {
		top: var(--space-2);
		right: var(--space-2);
	}

	.date {
		bottom: var(--space-2);
		left: var(--space-2);
		opacity: 0;
		transform: translateY(2px);
		transition:
			opacity var(--duration) var(--ease-out),
			transform var(--duration) var(--ease-out);
	}

	.photo-tile:focus-visible .date {
		opacity: 1;
		transform: none;
	}

	@media (hover: hover) and (pointer: fine) {
		.photo-tile:hover .date {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.photo-tile,
		.date {
			transition: none;
		}
	}
</style>
