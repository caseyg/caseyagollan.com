<script lang="ts">
	interface Props {
		dateKey: string;
	}

	let { dateKey }: Props = $props();

	function formatDate(dateStr: string) {
		const [year, month, day] = dateStr.split('-');
		return { year, month, day };
	}

	const dateInfo = $derived(formatDate(dateKey));
</script>

<h2 class="date-header">
	<div class="meta-pill">
		<a href="/{dateInfo.year}/" class="meta-segment">{dateInfo.year}</a>
		<a href="/{dateInfo.year}/{dateInfo.month}/" class="meta-segment">{dateInfo.month}</a>
		<a href="/{dateInfo.year}/{dateInfo.month}/{dateInfo.day}/" class="meta-segment">{dateInfo.day}</a>
	</div>
</h2>

<style>
	.date-header {
		margin: 1.25rem 0 0.75rem;
		font-size: 0.875rem;
		font-weight: 400;
		position: sticky;
		top: 0;
		background: #808080;
		padding: 0.375rem 0;
		z-index: 10;
	}

	.date-header:first-child {
		margin-top: 0;
	}

	.meta-pill {
		display: inline-flex;
		background: #0000ff;
		border-radius: 4px;
		overflow: hidden;
	}

	.meta-segment {
		padding: 0.25rem 0.5rem;
		color: #fff;
		text-decoration: none;
		border-right: 1px solid rgba(255, 255, 255, 0.3);
		font-size: 0.75rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.meta-segment:last-child {
		border-right: none;
	}

	.meta-segment:hover {
		background: #4949ff;
	}
</style>
