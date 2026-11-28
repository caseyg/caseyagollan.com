<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { BlockPicker, RenameTable, TableCanvas, TableToolbar, TableWireframe, TagDock, TABLES_CRUMB, type TableApi, type TableState } from '$lib/components/tables';
	import { enableTags, loadTags, stage, stagedCount, tagsAfter, tagStore } from '$lib/tag-edits.svelte';
	import { PageHeader } from '$lib/components/ui';
	import { page } from '$app/state';
	import { listTables, readDemoTable, saveTable, tablesSession, type TablesSession } from '$lib/tables-client';
	import { useTablesCommands } from '$lib/tables-commands.svelte';
	import { hashItem } from '$lib/table-search';
	import { searchBlocks, withOwnerSources } from '$lib/table-sources';
	import { recentFeed, similarBlocks } from '$lib/table-feed';
	import { isLookupOp, lookupOp } from '$lib/table-page-ops';
	import { pagePieces, pickPieces } from '$lib/table-pieces';
	import { PDF_PAGES_AT_ONCE, pdfName, pdfPageBlock, pdfPageSrc, pdfPages, renderSize, type PdfStore, type RenderedPage } from '$lib/table-render';
	import { wikiHref } from '$lib/wiki/links';
	import { blockKey, isBlockKind, type Block, type TableSummary } from '$lib/tables';
	import { offerTable } from '$lib/site-chat.svelte';
	import { VoiceNotes } from '$lib/voice-session.svelte';
	import { browserSource, workerSource } from '$lib/voice-source';
	import { VOICE_REFINE_PATH, type VoiceRefineAnswer, type VoiceRefineRequest } from '$lib/voice-notes';
	import type { TableItem, TableOp, TableOpEvent, TableOpResult } from '$lib/table-agent';

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
	let view = $state<TableState>({ tool: 'select', canUndo: false, canRedo: false, empty: true, placed: [], selection: [], taggable: [] });
	let adding = $state(false);
	/**
	 * The Add menu kept open as a sidebar down the right of the table, which this browser remembers
	 * (`open` when it was showing, `closed` when it wasn't). A phone has no room for one.
	 */
	const PIN_KEY = 'tables-add-sidebar';
	let pinnedWanted = $state(false);
	let narrow = $state(false);
	const pinned = $derived(pinnedWanted && !narrow);
	// The week's feed: the site's posts, and for Casey what was saved to Are.na, Raindrop and Readwise.
	const recent = $derived(recentFeed({ saves: session?.mode === 'owner' }));

	function remember(showing = adding) {
		try {
			if (pinnedWanted) localStorage.setItem(PIN_KEY, showing ? 'open' : 'closed');
			else localStorage.removeItem(PIN_KEY);
		} catch {
			// Without storage the sidebar just isn't remembered.
		}
	}

	function pin(next: boolean) {
		pinnedWanted = next;
		remember();
	}

	function showAdding(next: boolean) {
		adding = next;
		remember();
	}
	/** The block that was selected when Add opened; the picker offers its page's pieces. */
	let source = $state<Block>();
	/** The tag panel: off, editing the selection's tags, or reviewing what is staged before it is saved. */
	let tagging = $state<'edit' | 'review' | null>(null);
	let renaming = $state(false);
	let renameAnchor = $state<HTMLElement | null>(null);
	let status = $state<'saved' | 'unsaved' | 'saving' | 'failed'>('saved');

	const editable = $derived(!!session && session.mode !== 'visitor');
	const listHref = $derived(session?.mode === 'demo' ? '/tables/?owner=demo' : '/tables/');
	const statusText = $derived(
		!editable ? undefined : status === 'failed' ? 'Couldn’t save' : status === 'saving' || status === 'unsaved' ? 'Saving…' : session?.mode === 'demo' ? 'Saved in this browser' : 'Saved'
	);

	/**
	 * A finished voice note block, asked of a model: corrected, and placed after the block it follows.
	 * Nothing to ask (the demo, a Worker with no model) answers null and the block stays as heard.
	 */
	async function refineVoice(request: VoiceRefineRequest): Promise<VoiceRefineAnswer | null> {
		const response = await fetch(VOICE_REFINE_PATH, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': session?.csrf ?? '' }, body: JSON.stringify(request) });
		if ([401, 403, 503].includes(response.status)) return null;
		if (!response.ok) throw new Error(`Voice note refine answered ${response.status}`);
		return (await response.json()) as VoiceRefineAnswer;
	}

	// The owner's voice note: the Worker's speech model where there is one, the browser's dictation otherwise.
	const voice = new VoiceNotes({ canvas: () => api?.voice, sources: () => [workerSource(), browserSource()], refine: refineVoice, storage: typeof localStorage === 'undefined' ? undefined : localStorage });

	// Casey's chat (SiteChat, in the root layout) follows them here: this page offers it the
	// table, the table's own thread for when no chat is going, and the changes the assistant asks for.
	$effect(() => {
		if (!data.chat?.viewer?.owner) return;
		// What's selected goes with each message, so “these” means the cards Casey is pointing at.
		return offerTable({ table: id, thread: data.chat.snapshot.thread.id, ontableop: tableOp, get selection() { return view.selection; }, deselect: () => api?.deselect() });
	});

	// Whoever can change the table reads its blocks' tags (posts, Raindrop, Readwise) and may edit them.
	const taggedRefs = $derived([...new Set(view.taggable.map((block) => block.ref))].sort().join('\n'));
	$effect(() => {
		if (!editable || !session || session.mode === 'pass') return;
		enableTags(session);
		const refs = taggedRefs ? taggedRefs.split('\n') : [];
		if (!refs.length) return;
		// Blocks arrive in bursts (a table opening, a channel added): read their tags once they settle.
		const timer = setTimeout(() => void loadTags(refs), 400);
		return () => clearTimeout(timer);
	});

	/**
	 * “Tag these as X” from the chat: the blocks it names (ids, what a frame holds, or every block with
	 * tags), read, and any change staged for Casey to review. Nothing is saved from here.
	 */
	async function tagOp(op: Extract<TableOp, { op: 'tag' }>): Promise<TableOpResult> {
		const { items } = (await api!.perform({ op: 'read' })) as { items: TableItem[] };
		const strip = (value: string) => value.replace(/^shape:/, '');
		let wanted: Set<string> | undefined;
		if (op.inside) {
			const name = op.inside.trim().toLowerCase();
			const frame = items.find((item) => item.type === 'frame' && (item.id === strip(op.inside!) || item.text?.trim().toLowerCase() === name));
			if (!frame) return { ok: false, error: `No frame is called “${op.inside}”. Give a frame’s id or name.` };
			wanted = new Set([frame.id]);
		} else if (op.ids?.length) wanted = new Set(op.ids.map(strip));
		// A frame or group named stands for everything it holds.
		for (let grew = !!wanted; grew && wanted; ) {
			grew = false;
			for (const item of items) if (item.parent && wanted.has(item.parent) && !wanted.has(item.id)) grew = !!wanted.add(item.id);
		}
		const blocks = view.taggable.filter((block) => !wanted || wanted.has(block.id));
		if (!blocks.length) return { ok: false, error: wanted ? 'None of those have tags: only posts from this site, Raindrop bookmarks and Readwise items do.' : 'Nothing on this table has tags: only posts from this site, Raindrop bookmarks and Readwise items do.' };
		const refs = [...new Set(blocks.map((block) => block.ref))];
		await loadTags(refs);
		const changing = !!(op.add?.length || op.remove?.length);
		if (changing) {
			stage(refs, { add: op.add, remove: op.remove }, Object.fromEntries(blocks.map((block) => [block.ref, block.title])));
			tagging = 'review';
			if (!pinned) adding = false;
		}
		const unread = refs.filter((ref) => !tagStore.known[ref] || tagStore.known[ref].error).length;
		return {
			ok: true,
			result: {
				blocks: blocks.length,
				...(changing ? { staged: refs.filter((ref) => tagStore.staged[ref]).length, note: 'Staged, not saved. Casey reviews the changes in the Tags panel on the table and saves them there.' } : {}),
				tags: blocks.slice(0, 40).map((block) => ({ id: block.id, title: block.title.slice(0, 60), [changing ? 'tags_after' : 'tags']: tagsAfter(block.ref) })),
				...(blocks.length > 40 ? { more: blocks.length - 40 } : {}),
				...(unread ? { unread: `${unread} couldn’t be read just now; their changes are staged all the same.` } : {})
			}
		};
	}

	/** What the assistant asked of the table, done here so it animates, saves and undoes like Casey's own edits. */
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

	async function tableOp(event: TableOpEvent): Promise<TableOpResult> {
		if (!api || !editable) return { ok: false, error: 'The table isn’t ready to edit yet.' };
		const { type: _type, id: _id, ...op } = event;
		// Search results, links and relinking are found the same way in the table view inside Claude.
		if (isLookupOp(op)) return lookupOp(op, { api, placed: () => view.placed, search: ownerSearch, origin: location.origin });
		switch (op.op) {
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
			case 'tag':
				return tagOp(op);
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
			const found = await tablesSession();
			// Opened from the Claude connector with a pass to change this table: it saves, but isn't the owner.
			session = found.mode === 'visitor' && data.pass?.edit && data.pass.csrf ? { mode: 'pass', csrf: data.pass.csrf } : found;
			void listTables(session).then((list) => (tables = list));
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

		const phone = window.matchMedia('(max-width: 600px)');
		const fit = () => (narrow = phone.matches);
		fit();
		phone.addEventListener('change', fit);
		try {
			const kept = localStorage.getItem(PIN_KEY);
			pinnedWanted = kept !== null;
			// The sidebar comes back as it was left.
			if (kept === 'open' && !narrow) adding = true;
		} catch {
			// No storage: the menu, as before.
		}

		const warn = (event: BeforeUnloadEvent) => {
			if (status === 'unsaved' || status === 'saving') event.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => {
			window.removeEventListener('beforeunload', warn);
			voice.stop();
			phone.removeEventListener('change', fit);
			// Leaving for another page (or another table): save what's waiting now.
			if (pending !== undefined) void flush();
		};
	});

	// ⌘K lists the other tables and finds words on any of them; a result's link names the thing to show.
	let tables = $state<TableSummary[]>([]);
	useTablesCommands(() => ({ tables, mode: session?.mode ?? 'visitor', currentId: id }));
	$effect(() => {
		const item = hashItem(page.url.hash);
		if (item && api) void api.perform({ op: 'select', ids: [item] });
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
		// The sidebar stays until it is closed.
		if (!adding || pinned) return;
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
<main class="stage" class:with-sidebar={editable && adding && pinned}>
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
				onpublish={session.mode === 'pass' ? undefined : publish}
				details={view.details}
				ondetails={(shown) => api?.setDetails(shown)}
				ontool={(tool) => api?.setTool(tool)}
				onundo={() => api?.undo()}
				onredo={() => api?.redo()}
				onfit={() => api?.zoomToFit()}
				onadd={() => {
					// With the sidebar open, Add with another block selected turns the sidebar to that block.
					const turned = pinned && adding && !!view.selected && (!source || blockKey(view.selected) !== blockKey(source));
					source = view.selected;
					if (turned) return;
					showAdding(!adding);
					if (adding && !pinned) tagging = null;
				}}
				tags={editable && session.mode !== 'pass' ? { open: !!tagging, count: stagedCount() } : undefined}
				ontags={() => {
					tagging = tagging ? null : 'edit';
					if (tagging && !pinned) adding = false;
				}}
				voice={editable && session.mode !== 'pass' ? { status: voice.status, level: voice.level, notice: voice.notice, correct: voice.correct, arrange: voice.arrange } : undefined}
				onvoice={voice.toggle}
				onvoicecorrect={(on) => (voice.correct = on)}
				onvoicearrange={(on) => (voice.arrange = on)}
			/>
		</div>
		{#if editable && adding}
			<!-- One picker in two places: a menu over the table, or a sidebar the table makes room for. It keeps what it was showing when it moves. -->
			<div class={pinned ? 'sidebar' : 'dock dock--picker'}>
				<BlockPicker
					search={session.mode === 'owner' ? ownerSearch : searchBlocks}
					owner={session.mode === 'owner'}
					placed={view.placed}
					{source}
					pieces={(block) => pagePieces(block, wikiHref)}
					{recent}
					similar={session.mode === 'owner' ? similarBlocks : undefined}
					{pinned}
					onpin={pin}
					onadd={(blocks) => api?.addBlocks(blocks, undefined, { near: source, ...(blocks.length > 1 ? { columns: Math.min(blocks.length, 4) } : {}) })}
					onclose={() => showAdding(false)}
				/>
			</div>
		{/if}
		{#if editable && tagging}
			<div class="dock dock--picker dock--tags">
				<TagDock taggable={view.taggable} bind:mode={() => tagging ?? "edit", (next) => (tagging = next)} onclose={() => (tagging = null)} />
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

	/* The Add menu kept open as a sidebar (a SidePanel down the right): the canvas ends beside it. */
	.stage {
		--block-picker-width: 22rem;
	}

	@media (min-width: 900px) {
		.stage.with-sidebar {
			right: calc(var(--block-picker-width) + 2 * var(--nav-inset));
		}
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

		/* Both open: the sidebar stands beside the chat, and the canvas ends beside the sidebar. */
		:global(html[data-chat-dock='side']) .stage.with-sidebar {
			right: calc(var(--chat-dock-width) + var(--block-picker-width) + 3 * var(--nav-inset));
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
