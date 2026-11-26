<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { BlockPicker, RenameTable, TableCanvas, TableToolbar, TableWireframe, TABLES_CRUMB, type TableApi, type TableState } from '$lib/components/tables';
	import { PageHeader } from '$lib/components/ui';
	import { readDemoTable, saveTable, tablesSession, type TablesSession } from '$lib/tables-client';
	import { linkedBlock, searchBlocks, withOwnerSources } from '$lib/table-sources';
	import { pagePieces, pickPieces } from '$lib/table-pieces';
	import { PDF_PAGES_AT_ONCE, pdfName, pdfPageBlock, pdfPageSrc, pdfPages, renderSize, type PdfStore, type RenderedPage } from '$lib/table-render';
	import { wikiHref } from '$lib/wiki/links';
	import { blockKey, isBlockKind, type Block } from '$lib/tables';
	import { offerTable } from '$lib/site-chat.svelte';
	import type { TableItem, TableOpEvent, TableOpResult } from '$lib/table-agent';

	let { data }: { data: PageData } = $props();
	// The layout gives each table its own page; saves keep to the table this page opened,
	// even one that lands as the page goes.
	const id = untrack(() => data.id);

	let session = $state<TablesSession | null>(null);
	// The owner's Add menu also finds private Are.na blocks and Raindrop bookmarks.
	const ownerSearch = withOwnerSources();
	let name = $state('');
	let published = $state(true);
	let document: unknown = $state.raw(null);
	let seed: Block[] | undefined;
	let missing = $state(false);

	let api = $state<TableApi>();
	let view = $state<TableState>({ tool: 'select', canUndo: false, canRedo: false, empty: true, placed: [], selection: [] });
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

	// Casey's chat (SiteChat, in the root layout) follows them here: this page offers it the
	// table, the table's own thread for when no chat is going, and the changes the assistant asks for.
	$effect(() => {
		if (!data.chat?.viewer?.owner) return;
		// What's selected goes with each message, so “these” means the cards Casey is pointing at.
		return offerTable({ table: id, thread: data.chat.snapshot.thread.id, ontableop: tableOp, get selection() { return view.selection; }, deselect: () => api?.deselect() });
	});

	/**
	 * Where a PDF's page pictures are kept: Casey's go to the site's bucket, so each page is drawn once
	 * and anyone who sees the table gets it; the demo keeps smaller ones in the table itself.
	 */
	function pdfStore(address: string): PdfStore {
		if (session?.mode !== 'owner') {
			return {
				side: 800,
				kept: async () => null,
				keep: (_page, picture) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(picture); })
			};
		}
		const csrf = session.csrf ?? '';
		return {
			async kept(page) {
				const response = await fetch(`${pdfPageSrc(address, page)}&info`, { credentials: 'same-origin' });
				return response.ok ? ((await response.json()) as RenderedPage) : null;
			},
			async keep(page, picture, size) {
				const response = await fetch(`${pdfPageSrc(address, page)}&w=${size.w}&h=${size.h}&pages=${size.pages}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg', 'x-csrf-token': csrf }, body: picture });
				if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || 'A page’s picture couldn’t be kept.');
				return ((await response.json()) as RenderedPage).src;
			}
		};
	}

	/** What the assistant asked of the table, done here so it animates, saves and undoes like Casey's own edits. */
	async function tableOp(event: TableOpEvent): Promise<TableOpResult> {
		if (!api || !editable) return { ok: false, error: 'The table isn’t ready to edit yet.' };
		const { type: _type, id: _id, ...op } = event;
		switch (op.op) {
			case 'add_from_search': {
				const placed = new Set(view.placed);
				const found = ((await ownerSearch(op.query, op.filter ?? 'all')) ?? []).filter((block) => !placed.has(blockKey(block))).slice(0, op.limit ?? 6);
				if (!found.length) return { ok: true, result: { added: [], note: 'Nothing new matched.' } };
				const ids = api.addBlocks(found, op.at, { columns: op.columns ?? Math.min(found.length, 3), page: !!op.at, select: true });
				return { ok: true, result: { added: ids.map((shapeId, index) => ({ id: shapeId.replace(/^shape:/, ''), title: found[index]?.title, url: found[index]?.url })) } };
			}
			case 'add_links': {
				const blocks = (await Promise.all(op.urls.map((url) => linkedBlock(url, op.find?.[url], location.origin)))).filter((block): block is Block => !!block);
				if (!blocks.length) return { ok: false, error: 'None of those were links.' };
				const ids = api.addBlocks(blocks, op.at, { columns: op.columns ?? Math.min(blocks.length, 3), page: !!op.at, select: true });
				return { ok: true, result: { added: ids.map((shapeId) => shapeId.replace(/^shape:/, '')) } };
			}
			case 'add_pieces': {
				const { items } = (await api.perform({ op: 'read' })) as { items: TableItem[] };
				const item = items.find((one) => one.id === op.block.replace(/^shape:/, ''));
				if (!item?.url || !isBlockKind(item.type)) return { ok: false, error: `${op.block} isn’t a block on the table: name a post, link, wiki page or Are.na block by its id.` };
				const block: Block = { kind: item.type, url: item.url, title: item.title ?? item.url, image: item.image };
				const placed = new Set(view.placed);
				const { picked, more } = pickPieces((await pagePieces(block, wikiHref)).filter((piece) => !placed.has(blockKey(piece))), op);
				if (!picked.length) return { ok: true, result: { source: item.title, added: [], note: block.kind === 'book' ? 'Books have no page to take pictures or quotes from.' : 'Its page has no pictures or passages that aren’t on the table already.' } };
				const ids = api.addBlocks(picked, undefined, { near: block, columns: Math.min(picked.length, 3), select: false });
				return { ok: true, result: { source: item.title, added: ids.map((shapeId, index) => ({ id: shapeId.replace(/^shape:/, ''), kind: picked[index].kind, text: (picked[index].excerpt ?? picked[index].title).slice(0, 80) })), more } };
			}
			case 'add_pdf_pages': {
				const { items } = (await api.perform({ op: 'read' })) as { items: TableItem[] };
				const from = op.block ? items.find((one) => one.id === op.block!.replace(/^shape:/, '')) : undefined;
				const title = op.title || from?.title || pdfName(op.url);
				let drawn: Awaited<ReturnType<typeof pdfPages>>;
				try {
					drawn = await pdfPages(op.url, { from: Math.max(1, op.from ?? 1), count: Math.max(1, Math.min(PDF_PAGES_AT_ONCE, op.count ?? PDF_PAGES_AT_ONCE)) }, pdfStore(op.url));
				} catch (error) {
					return { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) };
				}
				const placed = new Set(view.placed);
				const fresh = drawn.pages.map((page) => ({ page, block: pdfPageBlock(op.url, title, page) })).filter(({ block }) => !placed.has(blockKey(block)));
				const already = drawn.pages.length - fresh.length;
				if (!fresh.length) return { ok: true, result: { added: [], pages: drawn.total, already_on_table: already, note: drawn.pages.length ? 'Those pages are on the table already.' : `It has only ${drawn.total} page${drawn.total === 1 ? '' : 's'}.` } };
				const near = from?.url && isBlockKind(from.type) ? ({ kind: from.type, url: from.url, title: from.title ?? from.url, image: from.image } satisfies Block) : undefined;
				const ids = api.addBlocks(fresh.map(({ block }) => block), undefined, { near, columns: Math.min(fresh.length, 4), select: false, sizes: fresh.map(({ page }) => renderSize(page)), plain: true });
				return { ok: true, result: { added: ids.map((shapeId, index) => ({ id: shapeId.replace(/^shape:/, ''), page: fresh[index].page.page })), pages: drawn.total, drawn: drawn.drawn, ...(already ? { already_on_table: already } : {}) } };
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
		void (async () => {
			session = await tablesSession();
			if (!data.table) {
				const local = session.mode === 'demo' ? readDemoTable(id) : null;
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
			// Leaving for another page (or another table): save what's waiting now.
			if (pending !== undefined) void flush();
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
		saving = saveTable(session, id, { document: next })
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
			name = (await saveTable(session, id, { name: next })).name;
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
			published = (await saveTable(session, id, { published: next })).published !== false;
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

<!-- Casey's docked chat takes the right side or, folded on a phone, the bottom: the canvas ends beside or above it (see .stage). -->
<main class="stage">
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

	/* Casey's docked chat (SiteChat): a sidebar the canvas makes room for, or a sheet it ends above.
	   Opening and folding the sheet only covers the canvas, so the camera stays put. */
	@media (min-width: 900px) {
		:global(html[data-chat-dock='side']) .stage {
			right: calc(var(--chat-dock-width) + 2 * var(--nav-inset));
		}
	}

	:global(html[data-chat-dock='sheet']) .stage {
		bottom: var(--chat-sheet-rest, 0px);
	}

	.missing {
		padding: calc(var(--nav-lane) + var(--space-6)) var(--space-5);
		text-align: center;
	}

	.missing a {
		color: inherit;
	}
</style>
