<script lang="ts">
	import { untrack } from 'svelte';
	import { blockKey, linkBlock, type Block } from '$lib/tables';
	import { LIKE_SEEDS_MAX, likeKey, likeLooks, likeTitle, type FeedItem, type LikeThing } from '$lib/table-feed';
	import { linkedBlock } from '$lib/table-sources';
	import type { SourceFilter } from '$lib/table-sources';
	import Button from '../ui/Button.svelte';
	import SegmentedPill from '../ui/SegmentedPill.svelte';
	import TextField from '../ui/TextField.svelte';
	import SidePanel from '../ui/SidePanel.svelte';
	import BlockFeed from './BlockFeed.svelte';
	import BlockList from './BlockList.svelte';

	type Tab = 'page' | 'similar' | 'recent' | 'site';

	interface Props {
		/** Finds site content; resolves null when there is no search index. */
		search: (query: string, filter: SourceFilter) => Promise<Block[] | null>;
		/** Adds blocks to the middle of the table. Blocks can also be dragged onto it. */
		onadd: (blocks: Block[]) => void;
		onclose?: () => void;
		/** Blocks already on the table, by `blockKey`; they are left out of the results. */
		placed?: string[];
		/** The block selected when the picker opened: its page's pictures, posts and paragraphs are offered first. */
		source?: Block;
		/** Reads a block's page into pieces. */
		pieces?: (block: Block) => Promise<Block[]>;
		/** The signed-in owner also gets a Raindrop filter for their bookmarks, which only they can see. */
		owner?: boolean;
		/**
		 * Everything posted and saved since a time. With it the picker has a Recent list: a group for each
		 * day, newest first, for a roundup of the week.
		 */
		recent?: (since: Date) => Promise<FeedItem[]>;
		/**
		 * Everything selected when the picker opened, to find the like of: blocks, and stickies and text
		 * boxes by their words. Left out, it is `source` alone.
		 */
		like?: LikeThing[];
		/** Saved things like what is selected. With it, the picker also offers what is like the selection. */
		similar?: (things: LikeThing[]) => Promise<Block[]>;
		/** Kept open as a sidebar down the right of the page instead of a menu. */
		pinned?: boolean;
		/** With it, the picker has a button that moves it between the menu and the sidebar. */
		onpin?: (pinned: boolean) => void;
		/** The list showing. It starts on Recent in the sidebar and on Search in the menu. */
		tab?: Tab;
		/** Starting query and filter, for stories. */
		query?: string;
		filter?: SourceFilter;
	}

	let { search, onadd, onclose, placed = [], source, like, pieces, owner = false, recent, similar, pinned = false, onpin, tab = $bindable(), query = $bindable(''), filter = $bindable('all') }: Props = $props();

	const onTable = $derived(new Set(placed));
	let found = $state<Block[]>([]);
	const results = $derived(found.filter((block) => !onTable.has(blockKey(block))));

	// Where the picker rests with nothing selected: the week's feed in the sidebar, search in the menu.
	const home = $derived<Tab>(recent && pinned ? 'recent' : 'site');
	const showing = $derived(tab ?? home);

	// The selected block's page, read once per block, and what is like the selection; the picker
	// opens on the block's pieces when it has any, else on what is like what is selected.
	let parts = $state<Block[] | null>(null);
	let alike = $state<Block[] | null>(null);
	const sourceKey = $derived(source ? blockKey(source) : '');
	const things = $derived<LikeThing[]>(like ?? (source ? [{ block: source }] : []));
	const thingsKey = $derived(similar ? things.map(likeKey).join('\n') : '');
	const cut = $derived(pieces && sourceKey ? pieces : undefined);
	$effect(() => {
		const key = `${sourceKey}\n${thingsKey}`;
		parts = null;
		alike = null;
		if (!key.trim() || (!cut && !thingsKey)) {
			// Nothing selected any more: back to the list the picker rests on.
			if (untrack(() => tab === 'page' || tab === 'similar')) tab = undefined;
			return;
		}
		let live = true;
		const from = untrack(() => source), likened = untrack(() => things);
		tab = cut ? 'page' : 'similar';
		const settle = () => {
			if (!live) return;
			// Leave a list that turned out empty for the next one that has something.
			if (tab === 'page' && parts?.length === 0) tab = thingsKey && alike?.length !== 0 ? 'similar' : undefined;
			if (tab === 'similar' && alike?.length === 0) tab = parts?.length ? 'page' : undefined;
		};
		void (cut && from ? cut(from).catch(() => []) : Promise.resolve([])).then((next) => {
			if (live) parts = next;
			settle();
		});
		void (similar && thingsKey ? similar(likened).catch(() => []) : Promise.resolve([])).then((next) => {
			if (live) alike = next;
			settle();
		});
		return () => {
			live = false;
		};
	});
	const partsLeft = $derived((parts ?? []).filter((block) => !onTable.has(blockKey(block))));
	const tabs = $derived.by(() => {
		const all = [
			...(sourceKey && pieces && parts?.length !== 0 ? [{ label: 'This page', value: 'page', icon: '✂️' }] : []),
			...(thingsKey && alike?.length !== 0 ? [{ label: 'Similar', value: 'similar', icon: '🧲' }] : []),
			...(recent ? [{ label: 'Recent', value: 'recent', icon: '🗓️' }] : []),
			{ label: 'Search', value: 'site', icon: '🔎' }
		];
		// Four don't fit with their emoji, and words say more than emoji alone.
		return all.length > 3 ? all.map(({ icon: _icon, ...tab }) => ({ ...tab, label: tab.value === 'page' ? 'Pieces' : tab.label })) : all;
	});
	let phase = $state<'idle' | 'loading' | 'done' | 'unavailable'>('idle');
	let link = $state('');
	let linkError = $state('');

	const filters = $derived([
		{ label: 'All', value: 'all' },
		{ label: 'Posts', value: 'post', icon: '📡' },
		{ label: 'Books', value: 'book', icon: '📚' },
		{ label: 'Wiki', value: 'wiki', icon: '🌱' },
		{ label: 'Are.na', value: 'arena', icon: '✳️' },
		...(owner ? [{ label: 'Raindrop', value: 'raindrop', icon: '💧' }] : [])
	]);

	// Each keystroke starts a search; only the latest one's results are shown.
	let latest = 0;
	$effect(() => {
		const run = ++latest;
		const q = query;
		const f = filter;
		phase = 'loading';
		const timer = setTimeout(async () => {
			const matches = await search(q, f).catch(() => []);
			if (run !== latest) return;
			found = matches ?? [];
			phase = matches === null ? 'unavailable' : 'done';
		}, q ? 150 : 0);
		return () => clearTimeout(timer);
	});

	async function addLink(event: SubmitEvent) {
		event.preventDefault();
		if (!linkBlock(link, location.origin)) {
			linkError = 'That doesn’t look like a web address.';
			return;
		}
		linkError = '';
		const typed = link;
		link = '';
		// One of the site's posts or Casey's Are.na channels comes in drawn as itself.
		const block = await linkedBlock(typed, [], location.origin);
		if (block) onadd([block]);
	}

	const emptyMessage = $derived(
		phase === 'unavailable' ? 'Search isn’t available here. Links still work.' : !query.trim() && filter === 'all' ? owner ? 'Search, or pick Books, Wiki, Are.na or Raindrop to browse.' : 'Search, or pick Books, Wiki or Are.na to browse them all.' : 'Nothing matches.'
	);
</script>

{#snippet lists()}
	{#if tabs.length > 1}
		<div class="tabs">
			<SegmentedPill segments={tabs} size="sm" label="Add from" value={showing} onValueChange={(value) => (tab = value as Tab)} />
		</div>
	{/if}

	{#if showing === 'page' && sourceKey}
		<p class="hint">Pieces of <strong>{source?.title}</strong>. Drag onto the table, or click to add.</p>
		<BlockList groups={[{ rows: partsLeft.map((block) => ({ block })) }]} {onadd} naming="kind" busy={parts === null} empty="Every piece is on the table." />
		{#if parts === null}<p class="hint">Reading the page…</p>{/if}
	{:else if showing === 'similar' && thingsKey}
		<p class="hint">
			{#if things.length === 1}
				Saved things that {likeLooks(things[0]) ? 'look' : 'read'} like <strong>{likeTitle(things[0])}</strong>, nearest first.
			{:else}
				Saved things like <strong>{things.length > LIKE_SEEDS_MAX ? `the first ${LIKE_SEEDS_MAX} of the ${things.length} things selected` : `the ${things.length} things selected`}</strong>. What is like more of them comes first.
			{/if}
		</p>
		<BlockList groups={[{ rows: (alike ?? []).map((block) => ({ block, placed: onTable.has(blockKey(block)) })) }]} {onadd} busy={alike === null} empty={things.length === 1 ? 'Nothing saved is like it.' : 'Nothing saved is like them.'} />
		{#if alike === null}<p class="hint">Looking…</p>{/if}
	{:else if showing === 'recent' && recent}
		<BlockFeed load={recent} {onadd} {placed} />
	{:else}
		<div class="controls">
			<TextField label={owner ? "Search posts, books, wiki, Are.na and Raindrop" : "Search posts, books, wiki and Are.na"} type="search" bind:value={query} placeholder="Search" autocomplete="off" />
			<SegmentedPill segments={filters} size="sm" label="Show" compact={owner ? 'always' : false} value={filter} onValueChange={(value) => (filter = value as SourceFilter)} />
		</div>

		<p class="hint">Drag onto the table, or click to add.</p>

		<BlockList groups={[{ rows: results.map((block) => ({ block })) }]} {onadd} busy={phase === 'loading'} empty={emptyMessage} />
	{/if}

	<form class="link" onsubmit={addLink}>
		<TextField label="Add a link" type="url" inputmode="url" bind:value={link} placeholder="https://" hint={linkError || 'Or paste a link straight onto the table.'} />
		<Button type="submit" variant="secondary" size="sm" disabled={!link.trim()}>Add link</Button>
	</form>
{/snippet}

{#if pinned}
	<!-- Kept open down the right of the page, beside the docked chat when that is open, for work that goes back and forth with the table. -->
	<SidePanel class="block-picker-panel" label="Add to table" compact {onclose}>
		{#snippet header()}<h2 class="heading">Add to table</h2>{/snippet}
		{#snippet actions()}
			{#if onpin}<Button variant="icon" size="sm" icon="sidebar" label="Back to a menu" pressed onclick={() => onpin(false)} />{/if}
		{/snippet}
		<div class="pinned">{@render lists()}</div>
	</SidePanel>
{:else}
	<section class="block-picker" aria-label="Add to table">
		<header class="head">
			<h2 class="heading">Add to table</h2>
			<span class="head-actions">
				{#if onpin}<span class="pin"><Button variant="icon" size="sm" icon="sidebar" label="Keep open as a sidebar" onclick={() => onpin(true)} /></span>{/if}
				{#if onclose}<Button variant="icon" size="sm" icon="close" label="Close" onclick={onclose} />{/if}
			</span>
		</header>
		{@render lists()}
	</section>
{/if}

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

	.head-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	/* The sidebar: the lists fill the panel, and each scrolls inside it. */
	.pinned {
		display: flex;
		flex-direction: column;
		height: 100%;
		/* Day headings stay put over the panel's blurred ground. */
		--block-list-ground: var(--bg-primary);
	}

	:global(.block-picker-panel) {
		--side-panel-width: var(--block-picker-width, 22rem);
	}

	:global(.block-picker-panel .side-panel-body) {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.tabs {
		margin-top: var(--space-2);
	}

	/* A phone has no room for a sidebar beside the table. */
	@media (max-width: 600px) {
		.pin {
			display: none;
		}
	}

	.hint strong {
		color: var(--text-secondary);
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






	.link {
		margin-top: var(--space-2);
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
