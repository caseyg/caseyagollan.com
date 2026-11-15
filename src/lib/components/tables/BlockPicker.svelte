<script lang="ts">
	import { linkBlock, type Block } from '$lib/tables';
	import type { SourceFilter } from '$lib/table-sources';
	import Button from '../ui/Button.svelte';
	import SegmentedPill from '../ui/SegmentedPill.svelte';
	import TextField from '../ui/TextField.svelte';
	import BlockCard from './BlockCard.svelte';
	import { BLOCK_DRAG_TYPE } from './TableCanvas.svelte';

	interface Props {
		/** Finds site content; resolves null when there is no search index. */
		search: (query: string, filter: SourceFilter) => Promise<Block[] | null>;
		/** Adds blocks to the middle of the table. Blocks can also be dragged onto it. */
		onadd: (blocks: Block[]) => void;
		onclose?: () => void;
		/** Starting query and filter, for stories. */
		query?: string;
		filter?: SourceFilter;
	}

	let { search, onadd, onclose, query = $bindable(''), filter = $bindable('all') }: Props = $props();

	let results = $state<Block[]>([]);
	let phase = $state<'idle' | 'loading' | 'done' | 'unavailable'>('idle');
	let link = $state('');
	let linkError = $state('');

	const filters = [
		{ label: 'All', value: 'all' },
		{ label: 'Posts', value: 'post', icon: '📡' },
		{ label: 'Books', value: 'book', icon: '📚' },
		{ label: 'Wiki', value: 'wiki', icon: '🌱' }
	];

	// Each keystroke starts a search; only the latest one's results are shown.
	let latest = 0;
	$effect(() => {
		const run = ++latest;
		const q = query;
		const f = filter;
		phase = 'loading';
		const timer = setTimeout(async () => {
			const found = await search(q, f).catch(() => []);
			if (run !== latest) return;
			results = found ?? [];
			phase = found === null ? 'unavailable' : 'done';
		}, q ? 150 : 0);
		return () => clearTimeout(timer);
	});

	function ondragstart(event: DragEvent, block: Block) {
		event.dataTransfer?.setData(BLOCK_DRAG_TYPE, JSON.stringify(block));
		event.dataTransfer?.setData('text/uri-list', new URL(block.url, location.origin).href);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
	}

	function addLink(event: SubmitEvent) {
		event.preventDefault();
		const block = linkBlock(link, location.origin);
		if (!block) {
			linkError = 'That doesn’t look like a web address.';
			return;
		}
		linkError = '';
		link = '';
		onadd([block]);
	}

	const emptyMessage = $derived(
		phase === 'unavailable' ? 'Search isn’t available here. Links still work.' : !query.trim() && filter === 'all' ? 'Search, or pick Books or Wiki to browse them all.' : 'Nothing matches.'
	);
</script>

<section class="block-picker" aria-label="Add to table">
	<header class="head">
		<h2 class="heading">Add to table</h2>
		{#if onclose}<Button variant="icon" size="sm" icon="close" label="Close" onclick={onclose} />{/if}
	</header>

	<div class="controls">
		<TextField label="Search posts, books and wiki" type="search" bind:value={query} placeholder="Search" autocomplete="off" />
		<SegmentedPill segments={filters} size="sm" label="Show" value={filter} onValueChange={(value) => (filter = value as SourceFilter)} />
	</div>

	<p class="hint">Drag onto the table, or click to add.</p>

	<ul class="results" aria-busy={phase === 'loading'}>
		{#each results as block (block.url)}
			<li>
				<button class="result" type="button" draggable="true" ondragstart={(event) => ondragstart(event, block)} onclick={() => onadd([block])} title="Add “{block.title}”">
					<BlockCard {block} layout="row" />
				</button>
			</li>
		{:else}
			{#if phase !== 'loading'}<li class="empty">{emptyMessage}</li>{/if}
		{/each}
	</ul>

	<form class="link" onsubmit={addLink}>
		<TextField label="Add a link" type="url" inputmode="url" bind:value={link} placeholder="https://" hint={linkError || 'Or paste a link straight onto the table.'} />
		<Button type="submit" variant="secondary" size="sm" disabled={!link.trim()}>Add link</Button>
	</form>
</section>

<style>
	.block-picker {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		height: 100%;
		min-height: 0;
		padding: var(--space-3) var(--space-4) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-primary);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
		overflow-y: auto;
		font-size: var(--fs-sm);
		font-weight: var(--fw-regular);
		line-height: var(--lh-normal);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.heading {
		margin: 0;
		font-size: var(--fs-base);
		font-weight: var(--fw-semibold);
	}

	.controls :global(.text-field) {
		margin: var(--space-2) 0;
	}

	.hint {
		margin: var(--space-2) 0 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.results {
		flex: 1;
		min-height: 6rem;
		margin: var(--space-2) calc(-1 * var(--space-2)) 0;
		padding: 0;
		list-style: none;
		overflow-y: auto;
	}

	.result {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: grab;
		transition: background var(--duration) var(--ease), scale 160ms var(--ease-out);
	}

	.result:active {
		cursor: grabbing;
		scale: 0.98;
	}

	@media (hover: hover) {
		.result:hover {
			background: var(--surface-2);
		}
	}

	.empty {
		padding: var(--space-3) var(--space-2);
		color: var(--text-muted);
	}

	.link {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border-subtle);
	}

	.link :global(.text-field) {
		width: 100%;
		margin-bottom: 0;
	}
</style>
