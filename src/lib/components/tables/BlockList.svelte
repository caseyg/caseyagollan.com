<script module lang="ts">
	import type { Block } from '$lib/tables';

	/** One line of the list. */
	export interface BlockRow {
		block: Block;
		/** A short note at the end of the line, such as the time it was saved. */
		note?: string;
		/** Already on the table: drawn gray, and neither added nor dragged again. */
		placed?: boolean;
	}

	/** Lines under a heading, such as a day. */
	export interface BlockGroup {
		label?: string;
		rows: BlockRow[];
	}
</script>

<script lang="ts">
	import { blockKey, KIND_LABEL } from '$lib/tables';
	import Button from '../ui/Button.svelte';
	import BlockCard from './BlockCard.svelte';
	import { BLOCK_DRAG_TYPE, BLOCK_LINK_TYPE } from './TableCanvas.svelte';

	interface Props {
		groups: BlockGroup[];
		/** Adds blocks to the table: the one clicked, or the ones selected. */
		onadd: (blocks: Block[]) => void;
		/** What to say when there is nothing to list. */
		empty?: string;
		/** More is on its way. */
		busy?: boolean;
		/** Names a line's block in its tooltip: `title` for a thing with a name, `kind` for a piece of a page. */
		naming?: 'title' | 'kind';
		/** The keys (`blockKey`) of the selected lines. */
		selected?: string[];
		/** Ids of things on the table that blocks dragged from this list are linked from where they land. */
		link?: string[];
		class?: string;
	}

	let { groups, onadd, empty, busy = false, naming = 'title', selected = $bindable([]), link, class: className = '' }: Props = $props();

	// Every line that can still be added, top to bottom: the order a range and a drag keep.
	const open = $derived(groups.flatMap((group) => group.rows).filter((row) => !row.placed));
	const keys = $derived(open.map((row) => blockKey(row.block)));
	// What is selected and still listed; a line that leaves the list, or lands on the table, leaves the selection.
	const chosen = $derived(new Set(selected.filter((key) => keys.includes(key))));
	const picked = $derived(open.filter((row) => chosen.has(blockKey(row.block))).map((row) => row.block));
	/** Where a shift-click's range starts: the line last clicked. */
	let anchor = $state<string>();
	let badge = $state<HTMLElement>();

	function onclick(event: MouseEvent, row: BlockRow) {
		if (row.placed) return;
		const key = blockKey(row.block);
		if (event.shiftKey) {
			// From the line last clicked to this one, on top of what is selected.
			const from = anchor && keys.includes(anchor) ? keys.indexOf(anchor) : keys.indexOf(key);
			const to = keys.indexOf(key);
			selected = [...new Set([...chosen, ...keys.slice(Math.min(from, to), Math.max(from, to) + 1)])];
			anchor ??= key;
			return;
		}
		if (event.metaKey || event.ctrlKey) {
			selected = chosen.has(key) ? [...chosen].filter((one) => one !== key) : [...chosen, key];
			anchor = key;
			return;
		}
		anchor = key;
		onadd([row.block]);
	}

	function ondragstart(event: DragEvent, row: BlockRow) {
		const transfer = event.dataTransfer;
		if (!transfer || row.placed) return event.preventDefault();
		// A selected line takes the whole selection with it, in the list's order.
		const blocks = chosen.has(blockKey(row.block)) && picked.length > 1 ? picked : [row.block];
		transfer.setData(BLOCK_DRAG_TYPE, JSON.stringify(blocks.length === 1 ? blocks[0] : blocks));
		if (link?.length) transfer.setData(BLOCK_LINK_TYPE, JSON.stringify(link));
		transfer.setData('text/uri-list', blocks.map((block) => new URL(block.url, location.origin).href).join('\r\n'));
		transfer.effectAllowed = 'copy';
		if (blocks.length > 1 && badge) transfer.setDragImage(badge, 16, 16);
	}

	function ondragend(event: DragEvent) {
		if (event.dataTransfer?.dropEffect !== 'none') selected = [];
	}

	function addPicked() {
		onadd(picked);
		selected = [];
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !chosen.size) return;
		event.stopPropagation();
		selected = [];
	}

	const tip = (row: BlockRow) => (row.placed ? 'On the table already' : naming === 'kind' ? `Add this ${KIND_LABEL[row.block.kind].toLowerCase()}` : `Add “${row.block.title}”`);
</script>

<!--
	The Add menu's lines: a click adds one to the table, and any can be dragged onto it. Shift-click
	selects from the line last clicked to this one (⌘ or Ctrl-click one at a time), and dragging a
	selected line takes them all. Lines already on the table are gray.
-->
<div class="block-list {className}" role="presentation" {onkeydown}>
	<div class="groups" aria-busy={busy}>
		{#each groups as group, at (group.label ?? at)}
			{#if group.rows.length}
				<section class="group">
					{#if group.label}<h3 class="day"><span>{group.label}</span><span class="count">{group.rows.length}</span></h3>{/if}
					<ul>
						{#each group.rows as row (blockKey(row.block))}
							{@const key = blockKey(row.block)}
							<li>
								<button
									class="row"
									class:placed={row.placed}
									type="button"
									draggable={!row.placed}
									aria-pressed={row.placed ? undefined : chosen.has(key)}
									aria-disabled={row.placed || undefined}
									title={tip(row)}
									ondragstart={(event) => ondragstart(event, row)}
									{ondragend}
									onclick={(event) => onclick(event, row)}
								>
									<BlockCard block={row.block} layout="row" />
									{#if row.placed}<span class="note">On table</span>{:else if row.note}<span class="note">{row.note}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
		{#if !groups.some((group) => group.rows.length) && !busy && empty}<p class="empty">{empty}</p>{/if}
	</div>
	{#if picked.length}
		<div class="picked">
			<span class="picked-count" role="status">{picked.length} selected</span>
			<Button variant="quiet" size="sm" onclick={() => (selected = [])}>Clear</Button>
			<Button variant="secondary" size="sm" icon="plus" onclick={addPicked}>Add {picked.length}</Button>
		</div>
	{/if}
	<!-- What follows the pointer when several lines are dragged together. -->
	<span class="badge" bind:this={badge} aria-hidden="true">{picked.length} blocks</span>
</div>

<style>
	.block-list {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 6rem;
	}

	.groups {
		flex: 1;
		min-height: 0;
		margin: 0 calc(-1 * var(--space-2));
		overflow-y: auto;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* A day's heading stays in view while its lines scroll under it. */
	.day {
		position: sticky;
		z-index: 1;
		top: 0;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-2) var(--space-2) var(--space-1);
		background: var(--block-list-ground, var(--bg-primary));
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
	}

	.count {
		color: var(--text-muted);
		font-weight: var(--fw-regular);
		font-variant-numeric: tabular-nums;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: grab;
		user-select: none;
		transition: background var(--duration) var(--ease), scale 160ms var(--ease-out);
	}

	.row :global(.block-card) {
		flex: 1;
		min-width: 0;
	}

	.row:active:not(.placed) {
		cursor: grabbing;
		scale: 0.98;
	}

	@media (hover: hover) {
		.row:hover:not(.placed) {
			background: var(--surface-2);
		}
	}

	.row[aria-pressed='true'] {
		background: var(--surface-3);
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}

	/* On the table already: still in its place in the list, out of the way. */
	.row.placed {
		cursor: default;
	}

	.row.placed :global(.block-card) {
		opacity: 0.4;
		filter: grayscale(1);
	}

	.note {
		flex: none;
		padding-right: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.empty {
		margin: 0;
		padding: var(--space-3) var(--space-2);
		color: var(--text-muted);
	}

	.picked {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border-subtle);
	}

	.picked-count {
		flex: 1;
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
	}

	.badge {
		position: fixed;
		top: -4rem;
		left: 0;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		background: var(--text-primary);
		color: var(--bg-primary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		white-space: nowrap;
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.row:active:not(.placed) {
			scale: none;
		}
	}
</style>
