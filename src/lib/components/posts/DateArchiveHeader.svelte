<script lang="ts">
	interface Props {
		year: string;
		month?: string;
		day?: string;
		count?: number;
	}

	let { year, month, day, count }: Props = $props();

	const backLink = $derived.by(() => {
		if (day && month) {
			return `/${year}/${month}/`;
		} else if (month) {
			return `/${year}/`;
		}
		return '/posts/';
	});

	const backText = $derived.by(() => {
		if (day && month) {
			const date = new Date(`${year}-${month}-01`);
			return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
		} else if (month) {
			return year;
		}
		return 'All Posts';
	});

	const countDescription = $derived.by(() => {
		if (count === undefined) return '';
		const postWord = count === 1 ? 'post' : 'posts';

		if (day && month) {
			const date = new Date(`${year}-${month}-${day}`);
			const formatted = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
			return `${count} ${postWord} from ${formatted}`;
		} else if (month) {
			const date = new Date(`${year}-${month}-01`);
			const formatted = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
			return `${count} ${postWord} from ${formatted}`;
		}
		return `${count} ${postWord} from ${year}`;
	});
</script>

<div class="header">
	<a href={backLink} class="back-link">{backText}</a>

	<div class="date-nav">
		<a href="/{year}/" class="date-segment" class:active={!month}>{year}</a>
		{#if month}
			<a href="/{year}/{month}/" class="date-segment" class:active={month && !day}>{month}</a>
		{/if}
		{#if day}
			<a href="/{year}/{month}/{day}/" class="date-segment" class:active={!!day}>{day}</a>
		{/if}
	</div>

	{#if count !== undefined}
		<p class="count-description">{countDescription}</p>
	{/if}
</div>

<style>
	.header {
		margin-bottom: 3rem;
	}

	.back-link {
		color: rgba(255, 255, 255, 0.7);
		text-decoration: none;
		font-size: 0.875rem;
		display: inline-block;
		margin-bottom: 0.5rem;
		margin-left: -0.5rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.back-link:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.back-link::before {
		content: '← ';
	}

	.date-nav {
		display: inline-flex;
		background: #0000ff;
		border-radius: 4px;
		overflow: hidden;
	}

	.date-segment {
		padding: 0.5rem 1rem;
		color: #fff;
		text-decoration: none;
		font-size: 1.25rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		transition: background 0.15s ease;
		border-right: 1px solid rgba(255, 255, 255, 0.3);
	}

	.date-segment:last-child {
		border-right: none;
	}

	.date-segment:hover {
		background: #4949ff;
	}

	.date-segment.active {
		background: #4949ff;
	}

	.count-description {
		margin: 0.75rem 0 0;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}
</style>
