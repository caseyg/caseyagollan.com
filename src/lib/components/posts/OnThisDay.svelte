<script lang="ts">
	import { Chip, Section } from '$lib/components/ui';
	import type { OnThisDayYear } from '$lib/on-this-day';

	interface Props {
		/** The day being read, as YYYY-MM-DD; the years are counted from it. */
		dateKey: string;
		/** Other years' posts on the same month and day, newest year first (`onThisDay`). */
		years: OnThisDayYear[];
		title?: string;
	}

	let { dateKey, years, title = 'On this day' }: Props = $props();

	const year = $derived(Number(dateKey.slice(0, 4)));
	const monthDay = $derived(
		new Date(`2000${dateKey.slice(4, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
	);

	function distance(other: string): string {
		const years = Number(other) - year;
		const count = Math.abs(years);
		return `${count} year${count === 1 ? '' : 's'} ${years < 0 ? 'earlier' : 'later'}`;
	}
</script>

<!--
	Posts from the same month and day in other years, below a day's own posts. Each year links to its
	day page and lists a few of that day's posts as one line each, so the block stays short. Plain
	links rather than post cards, so the day page's h-feed holds only its own posts.
-->
{#if years.length}
	<div class="on-this-day">
		<Section {title}>
			<p class="lede">{monthDay} in other years</p>
			<ol class="years">
				{#each years as entry (entry.year)}
					<li class="year">
						<div class="year-head">
							<Chip href={entry.href} variant="soft" size="sm">{entry.year}</Chip>
							<span class="distance">{distance(entry.year)}</span>
						</div>
						<ul class="items">
							{#each entry.items as item (item.href)}
								<li>
									<a href={item.href} class="item">
										<span class="icon" aria-hidden="true">{item.icon}</span>
										<span class="text">{item.text}</span>
										{#if item.photo}<img class="thumb" src={item.photo.url} alt={item.photo.alt} loading="lazy" decoding="async" />{/if}
									</a>
								</li>
							{/each}
						</ul>
						{#if entry.total > entry.items.length}
							<a href={entry.href} class="more">{entry.total - entry.items.length} more from {monthDay}, {entry.year} <span aria-hidden="true">→</span></a>
						{/if}
					</li>
				{/each}
			</ol>
		</Section>
	</div>
{/if}

<style>
	.on-this-day {
		margin-top: var(--space-7);
	}

	.lede {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
	}

	.years,
	.items {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.year {
		margin-top: var(--space-4);
	}

	.year-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
	}

	.distance {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: 0 calc(-1 * var(--space-2));
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		text-decoration: none;
		transition: background var(--duration) var(--ease);
	}

	.item:focus-visible {
		background: var(--surface-2);
	}

	@media (hover: hover) {
		.item:hover {
			background: var(--surface-2);
		}
	}

	.icon {
		flex: none;
		width: 1.25em;
		text-align: center;
	}

	.text {
		flex: 1;
		min-width: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.thumb {
		flex: none;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-sm);
		object-fit: cover;
		background: var(--surface-2);
	}

	.more {
		display: inline-block;
		margin-top: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		text-decoration: none;
	}

	@media (hover: hover) {
		.more:hover {
			color: var(--text-primary);
			text-decoration: underline;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.item {
			transition: none;
		}
	}
</style>
