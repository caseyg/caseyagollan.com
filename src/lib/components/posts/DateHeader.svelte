<script lang="ts">
	import { SegmentedPill } from '$lib/components/ui';

	interface Props {
		dateKey: string;
	}

	let { dateKey }: Props = $props();

	const segments = $derived.by(() => {
		const [year, month, day] = dateKey.split('-');
		return [
			{ label: year, href: `/${year}/` },
			{ label: month, href: `/${year}/${month}/` },
			{ label: day, href: `/${year}/${month}/${day}/` }
		];
	});
</script>

<h2 class="date-header">
	<span class="pill"><SegmentedPill {segments} label="Posts from {dateKey}" /></span>
</h2>

<style>
	.date-header {
		position: sticky;
		/* Below the pinned trail and navigation wherever they share the column's width. */
		top: var(--sticky-top, 0);
		z-index: var(--z-sticky);
		display: flex;
		justify-content: center;
		margin: var(--space-5) 0 var(--space-3);
		padding: var(--space-2) 0;
		background: var(--bg-primary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
		line-height: 1;
	}

	.date-header:first-child {
		margin-top: 0;
	}

	/*
	 * On a phone the date sticks in the top bar itself, centred in the gap between the trail and the
	 * navigation, when `Corner` reports that it fits. It keeps its ground colour so the date before it
	 * is covered, and sits under the two pinned groups.
	 */
	@media (max-width: 600px) {
		:global(:root[data-bar-room]) .date-header {
			top: 0;
			z-index: calc(var(--z-sticky) + 2);
			align-items: center;
			height: var(--sticky-top, auto);
			padding: 0;
		}

		/* The first date starts in the bar, so the gap is never empty and the feed starts sooner. */
		:global(:root[data-bar-room] .page > .post-feed) > .date-header:first-child {
			margin-top: calc(-1 * (var(--nav-lane) + var(--space-5)));
		}

		:global(:root[data-bar-room]) .pill {
			position: relative;
			left: calc((var(--corner-start, 0px) - var(--corner-end, 0px)) / 2);
		}
	}
</style>
