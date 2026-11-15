<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { BlockPicker, RenameTable, TableCanvas, TableToolbar, TABLES_CRUMB, type TableApi, type TableState } from '$lib/components/tables';
	import { PageHeader } from '$lib/components/ui';
	import { readDemoTable, saveTable, tablesSession, type TablesSession } from '$lib/tables-client';
	import { searchBlocks } from '$lib/table-sources';
	import type { Block } from '$lib/tables';

	let { data }: { data: PageData } = $props();

	let session = $state<TablesSession | null>(null);
	let name = $state('');
	let document: unknown = $state.raw(null);
	let seed: Block[] | undefined;
	let missing = $state(false);

	let api = $state<TableApi>();
	let view = $state<TableState>({ tool: 'select', canUndo: false, canRedo: false, empty: true });
	let adding = $state(false);
	let renaming = $state(false);
	let renameAnchor = $state<HTMLElement | null>(null);
	let status = $state<'saved' | 'unsaved' | 'saving' | 'failed'>('saved');

	const editable = $derived(!!session && session.mode !== 'visitor');
	const listHref = $derived(session?.mode === 'demo' ? '/tables/?owner=demo' : '/tables/');
	const statusText = $derived(
		!editable ? undefined : status === 'failed' ? 'Couldn’t save' : status === 'saving' || status === 'unsaved' ? 'Saving…' : session?.mode === 'demo' ? 'Saved in this browser' : 'Saved'
	);

	name = data.table?.name ?? '';
	document = data.table?.document ?? null;

	onMount(() => {
		void (async () => {
			session = await tablesSession();
			if (!data.table) {
				const local = session.mode === 'demo' ? readDemoTable(data.id) : null;
				if (!local) {
					missing = true;
					return;
				}
				name = local.name;
				document = local.document;
				seed = local.seed;
			}
		})();

		const warn = (event: BeforeUnloadEvent) => {
			if (status === 'unsaved' || status === 'saving') event.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});

	function onready(ready: TableApi) {
		api = ready;
		ready.subscribe((state) => (view = state));
		// The demo's sample table is set out the first time it opens.
		if (seed?.length && view.empty) {
			ready.addBlocks(seed, undefined, { columns: 4, select: false });
			ready.zoomToFit();
			seed = undefined;
		}
	}

	// Changes save a moment after they stop, one save at a time; the latest document always wins.
	let pending: unknown;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let saving: Promise<void> | undefined;

	function onchange(next: unknown) {
		if (!editable) return;
		pending = next;
		status = 'unsaved';
		clearTimeout(timer);
		timer = setTimeout(flush, 1200);
	}

	async function flush() {
		clearTimeout(timer);
		if (!session || pending === undefined) return;
		await saving;
		if (pending === undefined) return;
		const next = pending;
		pending = undefined;
		status = 'saving';
		saving = saveTable(session, data.id, { document: next })
			.then(() => {
				if (pending === undefined) status = 'saved';
			})
			.catch((error) => {
				console.error(error);
				pending ??= next;
				status = 'failed';
			});
		await saving;
	}

	async function rename(next: string) {
		if (!session) return;
		const previous = name;
		name = next;
		try {
			name = (await saveTable(session, data.id, { name: next })).name;
		} catch (error) {
			console.error(error);
			name = previous;
			status = 'failed';
		}
	}

	function openRename() {
		renameAnchor = window.document.querySelector<HTMLElement>('.page-header .trail button.segment');
		renaming = true;
	}

	function onkeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 's' && editable) {
			event.preventDefault();
			void flush();
		}
	}

	const nameSegment = $derived(
		editable ? { label: name || 'Untitled table', onclick: openRename, title: 'Rename', ariaLabel: `${name}, rename` } : { label: name || 'Table', href: '', current: true }
	);
</script>

<svelte:head>
	<title>{name ? `${name} - ` : ''}Tables - Casey Gollan</title>
	<meta name="description" content={name ? `${name}, a table by Casey Gollan` : 'A table by Casey Gollan'} />
	<meta property="og:title" content="{name || 'Table'} - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<svelte:window {onkeydown} />

<Nav currentPage="tables" />

<PageHeader trail={[{ ...TABLES_CRUMB, href: listHref }, nameSegment]} title={name || 'Table'} />

<main class="stage">
	{#if missing}
		<p class="missing">There’s no table at this address. <a href={listHref}>See all tables</a>.</p>
	{:else if session}
		<TableCanvas {document} {editable} {onchange} {onready} />
		<div class="dock dock--toolbar">
			<TableToolbar
				{editable}
				tool={view.tool}
				canUndo={view.canUndo}
				canRedo={view.canRedo}
				{adding}
				status={statusText}
				ontool={(tool) => api?.setTool(tool)}
				onundo={() => api?.undo()}
				onredo={() => api?.redo()}
				onfit={() => api?.zoomToFit()}
				onadd={() => (adding = !adding)}
			/>
		</div>
		{#if editable && adding}
			<div class="dock dock--picker">
				<BlockPicker search={searchBlocks} onadd={(blocks) => api?.addBlocks(blocks)} onclose={() => (adding = false)} />
			</div>
		{/if}
	{/if}
</main>

{#if editable}<RenameTable {name} anchor={renameAnchor} bind:open={renaming} onrename={rename} />{/if}

<style>
	/* The canvas takes the whole window; the trail and site navigation float over it. */
	.stage {
		position: fixed;
		inset: 0;
		font-size: var(--fs-base);
	}

	.dock {
		position: absolute;
		z-index: var(--z-sticky);
	}

	.dock--toolbar {
		left: 50%;
		bottom: var(--space-4);
		translate: -50% 0;
	}

	.dock--picker {
		top: calc(var(--nav-lane) + var(--space-4));
		right: var(--space-4);
		bottom: calc(var(--space-4) + 4rem);
		width: 22rem;
	}

	@media (max-width: 600px) {
		/* Above tldraw's watermark, which the licence needs to stay visible. */
		.dock--toolbar {
			bottom: 3rem;
		}

		.dock--picker {
			top: auto;
			left: var(--space-2);
			right: var(--space-2);
			bottom: calc(3rem + 3.5rem);
			width: auto;
			height: 60vh;
		}
	}

	.missing {
		padding: calc(var(--nav-lane) + var(--space-6)) var(--space-5);
		text-align: center;
	}

	.missing a {
		color: inherit;
	}
</style>
