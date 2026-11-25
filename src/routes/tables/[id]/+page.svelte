<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { BlockPicker, RenameTable, TableCanvas, TableToolbar, TableWireframe, TABLES_CRUMB, type TableApi, type TableState } from '$lib/components/tables';
	import { PageHeader } from '$lib/components/ui';
	import { readDemoTable, saveTable, tablesSession, type TablesSession } from '$lib/tables-client';
	import { searchBlocks, withOwnerSources } from '$lib/table-sources';
	import { pagePieces } from '$lib/table-pieces';
	import { wikiHref } from '$lib/wiki/links';
	import { blockKey, linkBlock, type Block } from '$lib/tables';
	import { ChatOverlay, type ChatOverlayMode } from '$lib/components/chat';
	import { LiveThread } from '$lib/chat-client.svelte';
	import { chatHref } from '$lib/chat';
	import { goto } from '$app/navigation';
	import type { TableOpEvent, TableOpResult } from '$lib/table-agent';

	let { data }: { data: PageData } = $props();

	let session = $state<TablesSession | null>(null);
	// The owner's Add menu also finds private Are.na blocks and Raindrop bookmarks.
	const ownerSearch = withOwnerSources();
	let name = $state('');
	let published = $state(true);
	let document: unknown = $state.raw(null);
	let seed: Block[] | undefined;
	let missing = $state(false);

	let api = $state<TableApi>();
	let view = $state<TableState>({ tool: 'select', canUndo: false, canRedo: false, empty: true, placed: [] });
	let adding = $state(false);
	/** The block that was selected when Add opened; the picker offers its page's pieces. */
	let source = $state<Block>();
	let renaming = $state(false);
	let renameAnchor = $state<HTMLElement | null>(null);
	let status = $state<'saved' | 'unsaved' | 'saving' | 'failed'>('saved');

	const editable = $derived(!!session && session.mode !== 'visitor');
	const listHref = $derived(session?.mode === 'demo' ? '/tables/?owner=demo' : '/tables/');
	const statusText = $derived(
		!editable ? undefined : status === 'failed' ? 'Couldn’t save' : status === 'saving' || status === 'unsaved' ? 'Saving…' : session?.mode === 'demo' ? 'Saved in this browser' : 'Saved'
	);

	// The table's chat: anyone reads along; Casey's page also makes the changes the assistant asks for.
	const CHAT_MODE_KEY = 'table-chat';
	let chatMode = $state<ChatOverlayMode>('minimized');
	// svelte-ignore state_referenced_locally
	const live = data.chat ? new LiveThread(data.chat.snapshot, data.chat.viewer, undefined, { onnavigate: (path) => void goto(path), ontableop: data.chat.viewer?.owner ? tableOp : undefined }) : undefined;
	const chatHereHref = `/tables/${data.id}`;

	$effect(() => {
		try { localStorage.setItem(CHAT_MODE_KEY, chatMode); } catch { /* private window */ }
	});

	/** What the assistant asked of the table, done here so it animates, saves and undoes like Casey's own edits. */
	async function tableOp(event: TableOpEvent): Promise<TableOpResult> {
		if (!api || !editable) return { ok: false, error: 'The table isn’t ready to edit yet.' };
		const { type: _type, id: _id, ...op } = event;
		if (chatMode === 'minimized') chatMode = 'floating';
		switch (op.op) {
			case 'add_from_search': {
				const placed = new Set(view.placed);
				const found = ((await ownerSearch(op.query, op.filter ?? 'all')) ?? []).filter((block) => !placed.has(blockKey(block))).slice(0, op.limit ?? 6);
				if (!found.length) return { ok: true, result: { added: [], note: 'Nothing new matched.' } };
				const ids = api.addBlocks(found, op.at, { columns: op.columns ?? Math.min(found.length, 3), page: !!op.at, select: true });
				return { ok: true, result: { added: ids.map((shapeId, index) => ({ id: shapeId.replace(/^shape:/, ''), title: found[index]?.title, url: found[index]?.url })) } };
			}
			case 'add_links': {
				const blocks = op.urls.map((url) => linkBlock(url, location.origin)).filter((block): block is Block => !!block);
				if (!blocks.length) return { ok: false, error: 'None of those were links.' };
				const ids = api.addBlocks(blocks, op.at, { columns: op.columns ?? Math.min(blocks.length, 3), page: !!op.at, select: true });
				return { ok: true, result: { added: ids.map((shapeId) => shapeId.replace(/^shape:/, '')) } };
			}
			case 'rename': {
				const next = op.name.trim();
				if (!next) return { ok: false, error: 'A table needs a name.' };
				await rename(next);
				return { ok: true, result: { name } };
			}
			default:
				return { ok: true, result: await api.perform(op) };
		}
	}

	name = data.table?.name ?? '';
	published = data.table?.published !== false;
	document = data.table?.document ?? null;

	onMount(() => {
		try {
			const saved = localStorage.getItem(CHAT_MODE_KEY);
			if (saved === 'floating' || saved === 'docked' || saved === 'minimized') chatMode = saved;
		} catch { /* private window */ }
		live?.connect();
		void (async () => {
			session = await tablesSession();
			if (!data.table) {
				const local = session.mode === 'demo' ? readDemoTable(data.id) : null;
				if (!local) {
					missing = true;
					return;
				}
				name = local.name;
				published = local.published !== false;
				document = local.document;
				seed = local.seed;
			}
		})();

		const warn = (event: BeforeUnloadEvent) => {
			if (status === 'unsaved' || status === 'saving') event.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => {
			window.removeEventListener('beforeunload', warn);
			live?.close();
		};
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

	// Pressing anywhere outside the picker (and the toolbar that opens it) closes it.
	$effect(() => {
		if (!adding) return;
		const close = (event: PointerEvent) => {
			if (!(event.target as Element | null)?.closest('.dock--picker, .dock--toolbar')) adding = false;
		};
		window.addEventListener('pointerdown', close, true);
		return () => window.removeEventListener('pointerdown', close, true);
	});

	async function publish(next: boolean) {
		if (!session) return;
		published = next;
		try {
			published = (await saveTable(session, data.id, { published: next })).published !== false;
		} catch (error) {
			console.error(error);
			published = !next;
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

<main class="stage" class:chat-docked={live && chatMode === 'docked'}>
	{#if !session && !missing}
		<!-- Sent with the page, so the table's outline is there from the first paint. -->
		<TableWireframe {document} />
	{/if}
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
				{published}
				onpublish={publish}
				details={view.details}
				ondetails={(shown) => api?.setDetails(shown)}
				ontool={(tool) => api?.setTool(tool)}
				onundo={() => api?.undo()}
				onredo={() => api?.redo()}
				onfit={() => api?.zoomToFit()}
				onadd={() => {
					source = view.selected;
					adding = !adding;
				}}
			/>
		</div>
		{#if editable && adding}
			<div class="dock dock--picker">
				<BlockPicker search={session.mode === 'owner' ? ownerSearch : searchBlocks} owner={session.mode === 'owner'} placed={view.placed} {source} pieces={(block) => pagePieces(block, wikiHref)} onadd={(blocks) => api?.addBlocks(blocks, undefined, { near: source })} onclose={() => (adding = false)} />
			</div>
		{/if}
	{/if}
</main>

{#if live && session && !missing}
	<div class="dock--chat" data-mode={chatMode}>
		<ChatOverlay
			bind:mode={chatMode}
			title={live.snapshot.thread.title}
			messages={live.messages}
			viewer={live.viewer}
			tools={live.tools}
			onsend={live.status === 'live' ? (text) => live.say(text) : undefined}
			action={chatHref(live.snapshot.thread.id)}
			returnTo={chatHereHref}
			href={chatHref(live.snapshot.thread.id)}
			error={live.error}
			signinError={data.chat?.signinError}
			offline={live.status === 'offline'}
		/>
	</div>
{/if}

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

	/* The chat: a pill or a floating panel at bottom left, or a sidebar the canvas makes room for. */
	.dock--chat {
		position: fixed;
		z-index: var(--z-sticky);
		left: var(--space-4);
		bottom: var(--space-4);
	}

	.dock--chat[data-mode='floating'] {
		bottom: calc(var(--space-4) + 4rem);
	}

	@media (min-width: 900px) {
		.stage.chat-docked {
			right: 24rem;
		}

		.dock--chat[data-mode='docked'] {
			inset: var(--nav-lane) 0 0 auto;
			width: 24rem;
		}
	}

	@media (max-width: 899px) {
		/* Too narrow to sit beside the canvas: docked floats like a sheet. */
		.dock--chat[data-mode='docked'] {
			bottom: calc(var(--space-4) + 4rem);
		}

		.dock--chat[data-mode='docked'] :global(.chat-overlay) {
			width: min(24rem, calc(100vw - 2 * var(--space-2)));
			height: min(36rem, 70vh);
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			overflow: hidden;
		}
	}

	@media (max-width: 600px) {
		.dock--chat {
			left: var(--space-2);
			right: var(--space-2);
		}

		.dock--chat[data-mode='minimized'] {
			left: auto;
			bottom: auto;
			top: calc(var(--nav-lane) + var(--space-2));
		}

		.dock--chat[data-mode='floating'],
		.dock--chat[data-mode='docked'] {
			bottom: calc(3rem + 3.5rem);
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
