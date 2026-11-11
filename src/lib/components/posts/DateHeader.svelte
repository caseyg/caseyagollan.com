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
	<SegmentedPill {segments} label="Posts from {dateKey}" />
</h2>

<style>
	.date-header {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		display: flex;
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
</style>
