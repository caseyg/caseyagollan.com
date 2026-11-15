<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { TableGrid, TABLES_CRUMB } from '$lib/components/tables';
	import { Button, Notice, Page, PageHeader } from '$lib/components/ui';
	import { createTable, listDemoTables, tableHref, tablesSession, type TablesSession } from '$lib/tables-client';
	import type { TableSummary } from '$lib/tables';

	let { data }: { data: PageData } = $props();

	let session = $state<TablesSession>({ mode: 'visitor' });
	let demoTables = $state<TableSummary[] | null>(null);
	let creating = $state(false);
	let failure = $state('');

	const tables = $derived(demoTables ?? data.tables);
	const editable = $derived(session.mode !== 'visitor');

	onMount(async () => {
		session = await tablesSession();
		if (session.mode === 'demo') demoTables = await listDemoTables();
	});

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
</script>

<svelte:head>
	<title>Tables - Casey Gollan</title>
	<meta name="description" content="Tables by Casey Gollan: posts, books, wiki pages and links set out on a canvas" />
	<meta property="og:title" content="Tables - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="tables" />

<Page as="main" width="wide" class="tables-page">
	<PageHeader trail={[{ ...TABLES_CRUMB, current: true }]} title="Tables" description="Posts, books, wiki pages and links, set out on tables to see side by side.">
		{#snippet actions()}
			{#if editable}
				<div class="actions">
					<Button variant="primary" size="sm" icon="plus" onclick={newTable} disabled={creating}>New table</Button>
				</div>
			{/if}
		{/snippet}
	</PageHeader>

	{#if session.mode === 'demo'}<Notice>Preview only: tables are saved in this browser.</Notice>{/if}
	{#if failure}<Notice tone="error">{failure}</Notice>{/if}

	<TableGrid {tables} href={(id) => tableHref(id, session.mode)} />
</Page>

<style>
	.actions {
		display: flex;
		justify-content: flex-end;
		align-self: start;
	}

	/* Cards want more room than a reading column. */
	:global(.tables-page.page--wide) {
		max-width: var(--content-max-width);
	}
</style>
