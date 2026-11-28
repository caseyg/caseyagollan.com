<script lang="ts">
	import { blockKey, type Block } from '$lib/tables';
	import { FEED_RANGES, FEED_SOURCES, groupByDay, rangeStart, timeLabel, type FeedItem, type FeedRange, type FeedSource } from '$lib/table-feed';
	import SegmentedPill from '../ui/SegmentedPill.svelte';
	import ToggleChip from '../ui/ToggleChip.svelte';
	import BlockList from './BlockList.svelte';

	interface Props {
		/** Everything posted and saved since a time, from every source. */
		load: (since: Date) => Promise<FeedItem[]>;
		onadd: (blocks: Block[]) => void;
		/** Blocks already on the table, by `blockKey`; they stay listed, in gray. */
		placed?: string[];
		/** How far back to list. */
		range?: FeedRange;
		/** The sources switched off. */
		off?: FeedSource[];
		/** The moment the days are counted back from, and the reader's time zone; for stories and tests. */
		now?: Date;
		timeZone?: string;
	}

	let { load, onadd, placed = [], range = $bindable('7'), off = $bindable([]), now, timeZone }: Props = $props();

	let items = $state.raw<FeedItem[]>([]);
	let phase = $state<'loading' | 'done' | 'failed'>('loading');

	// Each range is read afresh; only the latest one asked for is shown.
	let latest = 0;
	$effect(() => {
		const run = ++latest;
		phase = 'loading';
		load(rangeStart(Number(range), now ?? new Date(), timeZone)).then(
			(found) => {
				if (run !== latest) return;
				items = found;
				phase = 'done';
			},
			() => {
				if (run === latest) phase = 'failed';
			}
		);
	});

	const onTable = $derived(new Set(placed));
	// A pill for each source that has something in this range, with how many.
	const counts = $derived(items.reduce((sums, item) => sums.set(item.source, (sums.get(item.source) ?? 0) + 1), new Map<FeedSource, number>()));
	const pills = $derived(FEED_SOURCES.filter((source) => counts.has(source.value)));
	const shown = $derived(items.filter((item) => !off.includes(item.source)));
	const groups = $derived(
		groupByDay(shown, now ?? new Date(), timeZone).map((day) => ({
			label: day.label,
			rows: day.items.map((item) => ({ block: item.block, note: timeLabel(item.at, timeZone), placed: onTable.has(blockKey(item.block)) }))
		}))
	);
	const left = $derived(shown.filter((item) => !onTable.has(blockKey(item.block))).length);

	const toggle = (source: FeedSource, on: boolean) => (off = on ? off.filter((one) => one !== source) : [...off.filter((one) => one !== source), source]);
	const empty = $derived(phase === 'failed' ? 'The feed couldn’t be read. Search still works.' : items.length ? 'Every source is switched off.' : 'Nothing was posted or saved in this time.');
</script>

<!--
	What was posted and saved lately, for a roundup: the site's posts and Casey's Are.na, Raindrop
	and Readwise as one list, a group for each day, newest first. The pills switch sources off and on.
-->
<div class="block-feed">
	<div class="controls">
		<SegmentedPill segments={[...FEED_RANGES]} size="sm" label="How far back" value={range} onValueChange={(value) => (range = value as FeedRange)} />
		{#if pills.length > 1}
			<div class="pills" role="group" aria-label="Sources">
				{#each pills as source (source.value)}
					<ToggleChip bind:pressed={() => !off.includes(source.value), (on) => toggle(source.value, on)} title="{off.includes(source.value) ? 'Show' : 'Hide'} {source.label}">
						<span aria-hidden="true">{source.icon}</span>{source.label}<span class="pill-count">{counts.get(source.value)}</span>
					</ToggleChip>
				{/each}
			</div>
		{/if}
	</div>
	<p class="hint">
		{#if phase === 'loading' && !items.length}Reading…{:else}{left} to add. Click one, or shift-click several and drag them over together.{/if}
	</p>
	<BlockList {groups} {onadd} {empty} busy={phase === 'loading'} />
</div>

<style>
	.block-feed {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}

	.controls {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.pills :global(.toggle-chip) {
		gap: var(--space-1);
		padding: 2px var(--space-2);
	}

	.pill-count {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.hint {
		margin: var(--space-2) 0 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
</style>
