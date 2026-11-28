<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { TableGrid, TABLES_CRUMB } from '$lib/components/tables';
	import { Notice, Page, PageHeader } from '$lib/components/ui';
	import { createTable, listDemoTables, nameUntitledTables, tableHref, tablesSession, thumbnailUrl, withNewNames, type TablesSession } from '$lib/tables-client';
	import { isUntitled } from '$lib/table-names';
	import { useTablesCommands } from '$lib/tables-commands.svelte';
	import type { TableSummary } from '$lib/tables';

	let { data }: { data: PageData } = $props();

	let session = $state<TablesSession>({ mode: 'visitor' });
	let demoTables = $state<TableSummary[] | null>(null);
	let creating = $state(false);
	let failure = $state('');

	// Visitors see published tables; the owner also sees drafts.
	const tables = $derived(demoTables ?? session.tables ?? data.tables);
	const editable = $derived(session.mode !== 'visitor');

	onMount(async () => {
		session = await tablesSession();
		if (session.mode === 'demo') demoTables = await listDemoTables();
		// A table left a moment ago may be getting its name as this list loads.
		else if (session.tables) session.tables = await withNewNames(session.tables);
	});

	// The owner can have every untitled table named from what is on it (⌘K: Name untitled tables).
	let naming = $state(false);
	let named = $state<number | null>(null);
	const untitled = $derived(session.mode === 'owner' ? tables.filter((table) => isUntitled(table) && table.count > 0).length : 0);

	async function nameUntitled() {
		if (naming) return;
		naming = true;
		named = null;
		failure = '';
		try {
			named = await nameUntitledTables(session, (fresh) => {
				const names = new Map(fresh.map((table) => [table.id, table.name]));
				session.tables = session.tables?.map((table) => (names.has(table.id) ? { ...table, name: names.get(table.id)! } : table));
			});
		} catch (cause) {
			failure = cause instanceof Error ? cause.message : 'The tables couldn’t be named.';
		}
		naming = false;
	}

	async function newTable() {
		creating = true;
		failure = '';
		try {
			const table = await createTable(session);
			await goto(tableHref(table.id, session.mode));
		} catch (cause) {
			failure = cause instanceof Error ? cause.message : 'The table couldn’t be made.';
			creating = false;
		}
	}

	useTablesCommands(() => ({ tables, mode: session.mode, onNew: editable ? newTable : undefined, untitled, onNameUntitled: untitled && !naming ? nameUntitled : undefined }));
</script>

<svelte:head>
	<title>Tables - Casey Gollan</title>
	<meta name="description" content="Tables by Casey Gollan: posts, books, wiki pages, Are.na blocks and links set out on a canvas" />
	<meta property="og:title" content="Tables - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="tables" />

<Page as="main" width="wide" class="tables-page">
	<PageHeader trail={[{ ...TABLES_CRUMB, current: true }]} title="Tables" description="Posts, books, wiki pages, Are.na blocks and links, set out on tables to see side by side." />

	{#if session.mode === 'demo'}<Notice>Preview only: tables are saved in this browser.</Notice>{/if}
	{#if failure}<Notice tone="error">{failure}</Notice>{/if}
	{#if naming}<Notice>Naming untitled tables…</Notice>{:else if named !== null}<Notice>{named === 0 ? 'No untitled table could be named.' : named === 1 ? 'Named 1 table.' : `Named ${named} tables.`}</Notice>{/if}

	<TableGrid {tables} href={(id) => tableHref(id, session.mode)} thumbnail={(table) => thumbnailUrl(table, session.mode)} onNew={editable ? newTable : undefined} {creating} />
</Page>

<style>
	/* Cards want more room than a reading column, so the page always starts below the trail and navigation. */
	:global(.tables-page.page--wide) {
		max-width: var(--content-max-width);
		padding-top: calc(var(--nav-lane) + var(--space-5));
	}
</style>
