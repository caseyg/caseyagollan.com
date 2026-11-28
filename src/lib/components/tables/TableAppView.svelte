<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Button from '../ui/Button.svelte';
	import Notice from '../ui/Notice.svelte';
	import BlockPicker from './BlockPicker.svelte';
	import TableCanvas from './TableCanvas.svelte';
	import TableToolbar from './TableToolbar.svelte';
	import type { TableApi, TableState, TableTool } from './canvas/TableEditor';
	import { isLookupOp, lookupOp } from '$lib/table-page-ops';
	import { layoutOp, type LayoutScope } from '$lib/table-menus';
	import { searchBlocks } from '$lib/table-sources';
	import type { TableOpEvent, TableOpResult } from '$lib/table-agent';
	import type { TableViewLink, ViewDisplay } from '$lib/table-view-link';

	interface Props {
		/** The table as the site has it. */
		table: { id: string; name: string; document: unknown };
		/** The site's address: where the table's own page is, and what its posts' links are told by. */
		origin: string;
		/** Saves the table and brings the changes asked of it. */
		link: TableViewLink;
		/** Off where the connection may only look: the canvas pans and zooms, and nothing is saved. */
		editable?: boolean;
		display?: ViewDisplay;
		search?: typeof searchBlocks;
	}

	let { table, origin, link, editable = true, display, search = searchBlocks }: Props = $props();

	const id = untrack(() => table.id);
	let name = $state(untrack(() => table.name));
	let api = $state<TableApi>();
	let view = $state<TableState>({ tool: 'select', canUndo: false, canRedo: false, empty: true, placed: [], selection: [], taggable: [] });
	let adding = $state(false);
	let status = $state<'saved' | 'unsaved' | 'saving' | 'failed'>('saved');
	/** A newer view of this table opened: this one stops changing and saving it. */
	let replaced = $state(false);
	let gone = false;

	const statusText = $derived(replaced ? undefined : status === 'failed' ? 'Couldn’t save' : status === 'saved' ? 'Saved' : 'Saving…');
	const ONLY_ON_SITE = 'That only works on the table’s own page on the site, not on a table open in Claude.';

	/** What a table tool asked of the canvas, done here so Casey watches it happen. */
	async function tableOp(event: TableOpEvent): Promise<TableOpResult> {
		if (!api || replaced) return { ok: false, error: 'The table isn’t ready to edit yet.' };
		const { type: _type, id: _id, ...op } = event;
		try {
			if (isLookupOp(op)) return await lookupOp(op, { api, placed: () => view.placed, search, origin });
			switch (op.op) {
				case 'add_pieces':
				case 'add_pdf_pages':
				case 'tag':
					return { ok: false, error: ONLY_ON_SITE };
				case 'rename': {
					const next = op.name.trim();
					if (!next) return { ok: false, error: 'A table needs a name.' };
					name = (await link.save({ name: next })).name;
					return { ok: true, result: { name } };
				}
				default:
					return { ok: true, result: await api.perform(op) };
			}
		} catch (error) {
			return { ok: false, error: String((error as Error)?.message ?? error).slice(0, 300) };
		}
	}

	/** The table's own page: with a pass from the site where it gives one, so it opens without signing in. */
	async function openOnSite() {
		const url = (await link.link?.().catch(() => undefined)) ?? `${origin}/tables/${id}`;
		window.open(url, '_blank', 'noopener');
	}

	const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	/** Asks for the next change, makes it, reports back, and asks again, for as long as this view is the table's. */
	async function listen() {
		const dropped = new Set<string>();
		for (let misses = 0; !gone && !replaced; ) {
			let turn: Awaited<ReturnType<TableViewLink['next']>>;
			try {
				turn = await link.next();
				misses = 0;
			} catch {
				await pause(Math.min(1000 * 2 ** misses++, 15_000));
				continue;
			}
			if ('replaced' in turn) {
				replaced = true;
				clearTimeout(timer);
				pending = undefined;
				return;
			}
			for (const one of turn.cancel ?? []) dropped.add(one);
			if (!('op' in turn) || !turn.op || dropped.has(turn.op.id)) continue;
			const result = await tableOp(turn.op);
			await link.done(turn.op.id, result).catch(() => {});
		}
	}

	function layout(value: string, scope: LayoutScope) {
		const op = layoutOp(value, scope, view.selection.map((item) => item.id));
		if (op) void api?.perform(op);
	}

	function onready(ready: TableApi) {
		api = ready;
		ready.subscribe((state) => (view = state));
		if (!view.empty) ready.zoomToFit();
		if (editable) void listen();
	}

	// Changes save a moment after they stop, one save at a time; the latest document always wins.
	let pending: unknown;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let saving: Promise<void> | undefined;

	function onchange(next: unknown) {
		if (replaced || !editable) return;
		pending = next;
		status = 'unsaved';
		clearTimeout(timer);
		timer = setTimeout(flush, 1200);
	}

	/** Saves what is waiting now. The view's host calls it before it takes the view away. */
	export async function flush() {
		clearTimeout(timer);
		if (pending === undefined || replaced) return;
		await saving;
		if (pending === undefined || replaced) return;
		const next = pending;
		pending = undefined;
		status = 'saving';
		saving = link.save({ document: next }).then(
			() => {
				if (pending === undefined) status = 'saved';
			},
			(error) => {
				console.error(error);
				pending ??= next;
				status = 'failed';
			}
		);
		await saving;
	}

	onMount(() => () => {
		gone = true;
		void flush();
	});
</script>

<!-- One of Casey's tables as it shows inside Claude: the canvas and its tools, without the site around it. -->
<section class="table-app" class:full={display?.full} aria-label={name}>
	{#key replaced}
		<TableCanvas document={replaced ? (api?.document() ?? table.document) : table.document} editable={editable && !replaced} {onchange} onready={replaced ? undefined : onready} />
	{/key}
	<header class="bar">
		<Button variant="secondary" size="sm" onclick={openOnSite} title="Open this table on caseyagollan.com">{name || 'Untitled table'}</Button>
		{#if display?.toggle}
			<Button variant="icon" size="sm" icon={display.full ? 'floating' : 'fullscreen'} label={display.full ? 'Back to the conversation' : 'Full screen'} onclick={display.toggle} />
		{/if}
	</header>
	{#if replaced}
		<div class="replaced">
			<Notice>This table is open again further on in the conversation. That view takes the changes now; this one is a picture of how it was.</Notice>
		</div>
	{:else if api}
		<div class="tools">
			<TableToolbar
				{editable}
				tool={view.tool}
				canUndo={view.canUndo}
				canRedo={view.canRedo}
				{adding}
				onadd={() => (adding = !adding)}
				status={editable ? statusText : undefined}
				details={view.details}
				ondetails={(shown) => api?.setDetails(shown)}
				ontool={(tool, geo) => api?.setTool(tool as TableTool, geo)}
				geo={view.geo}
				onmedia={(files) => void api?.addMedia(files)}
				selection={view.selection}
				onlayout={layout}
				autoLayout={view.autoLayout}
				onautolayout={(value) => api?.setAutoLayout(value)}
				onundo={() => api?.undo()}
				onredo={() => api?.redo()}
				onfit={() => api?.zoomToFit()}
			/>
		</div>
		{#if editable && adding}
			<div class="picker">
				<BlockPicker {search} placed={view.placed} onadd={(blocks) => api?.addBlocks(blocks)} onclose={() => (adding = false)} />
			</div>
		{/if}
	{/if}
</section>

<style>
	.table-app {
		position: relative;
		/* A set height: the host makes the frame as tall as its content, so it can't be a share of the frame. */
		height: 600px;
		font-size: var(--fs-base);
		color: var(--text-primary);
		background: var(--bg-primary);
	}

	.table-app.full {
		height: 100vh;
	}

	.bar {
		position: absolute;
		top: var(--space-3);
		left: var(--space-3);
		right: var(--space-3);
		z-index: var(--z-sticky);
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		pointer-events: none;
	}

	.bar > :global(*) {
		pointer-events: auto;
	}

	.tools {
		position: absolute;
		left: 50%;
		bottom: var(--space-4);
		translate: -50% 0;
		z-index: var(--z-sticky);
		max-width: calc(100% - 2 * var(--space-2));
	}

	.picker {
		position: absolute;
		z-index: var(--z-sticky);
		top: calc(var(--space-3) + 3rem);
		right: var(--space-3);
		bottom: calc(var(--space-4) + 4rem);
		width: min(22rem, calc(100% - 2 * var(--space-3)));
	}

	.replaced {
		position: absolute;
		left: 50%;
		bottom: var(--space-4);
		translate: -50% 0;
		width: min(30rem, calc(100% - 2 * var(--space-4)));
	}

	.replaced :global(.notice) {
		margin: 0;
		background: var(--surface-sunken);
	}

	@media (max-width: 600px) {
		/* Above tldraw's watermark, which the licence needs to stay visible. */
		.tools {
			bottom: 3rem;
		}
	}
</style>
